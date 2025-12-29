# server/app.py
from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS
from flask_bcrypt import Bcrypt
import mysql.connector.pooling
import os
import re
import base64
from datetime import datetime
from werkzeug.utils import secure_filename
from contextlib import contextmanager
import logging
import json
from math import radians, sin, cos, sqrt, atan2
import numpy as np
import uuid
from sentence_transformers import SentenceTransformer
EMBEDDING_MODEL_NAME = "intfloat/multilingual-e5-base"
model = SentenceTransformer(EMBEDDING_MODEL_NAME)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
bcrypt = Bcrypt(app)

# 🔧 DB konfigurácia
DB_HOST = os.getenv("DB_HOST", "80.211.195.85")
DB_USER = os.getenv("DB_USER", "admin")
DB_PASS = os.getenv("DB_PASS", "bezpecneHeslo123!")
DB_NAME = os.getenv("DB_NAME", "dbdata")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

# 🧩 Connection pool
pool = mysql.connector.pooling.MySQLConnectionPool(
    pool_name="lifebridge_pool",
    pool_size=int(os.getenv("DB_POOL_SIZE", "20")),
    host=DB_HOST,
    user=DB_USER,
    password=DB_PASS,
    database=DB_NAME,
    port=DB_PORT,
    autocommit=True,
    charset="utf8mb4"
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "WARNING"))

# Bezpečný getter s ukladaním do g + lazy
def get_conn():
    conn = getattr(g, "_db_conn", None)
    try:
        if conn and conn.is_connected():
            return conn
    except Exception:
        # stale/closed connection left in g; drop it and reopen
        conn = None
        try:
            setattr(g, "_db_conn", None)
        except Exception:
            pass

    conn = pool.get_connection()
    try:
        setattr(g, "_db_conn", conn)
    except Exception:
        pass
    logging.debug("DB conn acquired")
    return conn

@contextmanager
def db_conn():
    # umožní použitie with db_conn() as conn:
    conn = pool.get_connection()
    logging.debug("DB conn acquired (ctx)")
    try:
        yield conn
    finally:
        try:
            conn.close()
            logging.debug("DB conn closed (ctx)")
        except Exception:
            pass

def build_user_hobby_text(conn, user_id: int) -> str:
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT id_user FROM users WHERE id_user = %s AND soft_del = 0",
            (user_id,),
        )
        if not cur.fetchone():
            raise ValueError("User not found")

        cur.execute(
            """
            SELECT h.nazov
            FROM user_hobby uh
            JOIN hobby h ON h.id_hobby = uh.id_hobby
            WHERE uh.id_user = %s
            """,
            (user_id,),
        )
        hobbies = [row[0] for row in cur.fetchall()]
    finally:
        cur.close()

    if not hobbies:
        return ""

    return "Záľuby: " + ", ".join(hobbies) + "."


def generate_and_save_user_embedding(user_id: int):
    with db_conn() as conn:
        text = build_user_hobby_text(conn, user_id)
        if not text.strip():
            return

        emb = model.encode(text)
        emb_list = emb.tolist()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO user_embeddings (user_id, embedding, model_name)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE
                  embedding = VALUES(embedding),
                  model_name = VALUES(model_name),
                  updated_at = CURRENT_TIMESTAMP
                """,
                (user_id, json.dumps(emb_list), EMBEDDING_MODEL_NAME),
            )
            conn.commit()
        finally:
            cur.close()


def get_user_embedding_vector(conn, user_id: int):
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT embedding FROM user_embeddings WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    finally:
        cur.close()

    if not row:
        return None

    return np.array(json.loads(row[0]), dtype=float)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0.0:
        return 0.0
    return float(np.dot(a, b) / denom)

# Simple in-memory cache so we do not geocode the same city repeatedly.
CITY_COORD_CACHE: dict[str, tuple[float, float]] = {}


def get_city_coordinates(city_name: str) -> tuple[float, float] | None:
    """
    Reuses the existing geocode_address helper to fetch coordinates for a city.
    The cache keeps repeated calls cheap within the same process.
    """
    if not city_name:
        return None
    key = city_name.strip().lower()
    if not key:
        return None
    if key in CITY_COORD_CACHE:
        return CITY_COORD_CACHE[key]

    try:
        lat, lng = geocode_address(city_name)
    except Exception as exc:
        logging.warning("Failed to geocode city '%s': %s", city_name, exc)
        return None

    CITY_COORD_CACHE[key] = (lat, lng)
    return lat, lng


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute distance between two lat/lon pairs in kilometers."""
    R = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = (
        sin(d_lat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    )
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c


def find_best_matches_for_user(
    user_id: int,
    top_n: int = 5,
    target_role: str | None = None,
    distance_km: float | None = None,
):
    with db_conn() as conn:
        emb = get_user_embedding_vector(conn, user_id)
        if emb is None:
            text = build_user_hobby_text(conn, user_id)
            if not text.strip():
                return []

            emb = model.encode(text)
            emb_list = emb.tolist()
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    INSERT INTO user_embeddings (user_id, embedding, model_name)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                      embedding = VALUES(embedding),
                      model_name = VALUES(model_name),
                      updated_at = CURRENT_TIMESTAMP
                    """,
                    (user_id, json.dumps(emb_list), EMBEDDING_MODEL_NAME),
                )
                conn.commit()
            finally:
                cur.close()

        # Ensure we only consider users from the same city as the current user.
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT mesto FROM users WHERE id_user = %s AND soft_del = 0",
                (user_id,),
            )
            city_row = cur.fetchone()
        finally:
            cur.close()

        if not city_row:
            return []

        current_city = city_row[0]
        if not current_city:
            # No city info -> do not recommend cross-city users.
            return []

        current_coords = None
        if distance_km is not None:
            current_coords = get_city_coordinates(current_city)
            if not current_coords:
                # Without coordinates we cannot apply distance filter.
                return []

        params = [user_id]
        where = ["u.id_user != %s", "u.soft_del = 0"]
        if distance_km is None:
            where.append("u.mesto = %s")
            params.append(current_city)
        else:
            where.append("u.mesto IS NOT NULL AND u.mesto <> ''")
        if target_role:
            where.append("u.rola = %s")
            params.append(target_role)

        cur = conn.cursor(dictionary=True)
        try:
            cur.execute(
                f"""
                SELECT u.id_user, u.meno, u.priezvisko, u.mail, u.rola, u.mesto, e.embedding
                FROM users u
                JOIN user_embeddings e ON e.user_id = u.id_user
                WHERE {" AND ".join(where)}
                """,
                tuple(params),
            )
            rows = cur.fetchall()
        finally:
            cur.close()

        results = []
        for row in rows:
            # Apply distance filter before hobby similarity if requested.
            if distance_km is not None:
                other_city = (row.get("mesto") or "").strip()
                if not other_city:
                    continue
                other_coords = get_city_coordinates(other_city)
                if not other_coords or not current_coords:
                    continue
                dist_val = haversine_km(
                    current_coords[0],
                    current_coords[1],
                    other_coords[0],
                    other_coords[1],
                )
                if dist_val > distance_km:
                    continue

            other_emb = np.array(json.loads(row["embedding"]), dtype=float)
            sim = cosine_similarity(emb, other_emb)
            item = {
                "id_user": row["id_user"],
                "meno": row["meno"],
                "priezvisko": row["priezvisko"],
                "mail": row["mail"],
                "rola": row["rola"],
                "similarity": sim,
                "similarity_percent": round(sim * 100, 1),
            }
            if distance_km is not None:
                item["distance_km"] = round(dist_val, 1)
            results.append(item)

        # Rank same-city candidates by hobby/interest similarity (cosine distance).
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:top_n]


# Media storage for avatars (assets/img + DB metadata)
BASE_DIR = os.path.dirname(__file__)
ASSETS_IMG_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "assets", "img"))
AVATARS_DIR = os.path.join(ASSETS_IMG_DIR, "avatars")
POST_IMAGES_DIR = os.path.join(ASSETS_IMG_DIR, "posts")
ACTIVITY_IMAGES_DIR = os.path.join(ASSETS_IMG_DIR, "activities")
ARTICLE_IMAGES_DIR = os.path.join(ASSETS_IMG_DIR, "articles")
LEGACY_AVATARS_DIR = os.path.join(BASE_DIR, "uploads", "avatars")
os.makedirs(AVATARS_DIR, exist_ok=True)
os.makedirs(POST_IMAGES_DIR, exist_ok=True)
os.makedirs(ACTIVITY_IMAGES_DIR, exist_ok=True)
os.makedirs(ARTICLE_IMAGES_DIR, exist_ok=True)
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

def _avatar_disk_path(file_uid: str, ext: str) -> str:
    return os.path.join(AVATARS_DIR, f"{file_uid}{ext}")

def _post_image_disk_path(file_uid: str, ext: str) -> str:
    return os.path.join(POST_IMAGES_DIR, f"{file_uid}{ext}")

def _activity_image_disk_path(file_uid: str, ext: str) -> str:
    return os.path.join(ACTIVITY_IMAGES_DIR, f"{file_uid}{ext}")

def _article_image_disk_path(file_uid: str, ext: str) -> str:
    return os.path.join(ARTICLE_IMAGES_DIR, f"{file_uid}{ext}")

def _legacy_avatar_path_for(user_id: int, ext: str):
    return os.path.join(LEGACY_AVATARS_DIR, f"user_{user_id}{ext}")

def _find_legacy_avatar(user_id: int):
    for ext in ALLOWED_IMAGE_EXTS:
        path = _legacy_avatar_path_for(user_id, ext)
        if os.path.exists(path):
            return path, ext
    return None, None

def _delete_avatar_records(conn, user_id: int):
    """
    Remove DB rows + files for a user's avatar. Keeps only media_files entries in sync.
    """
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """
            SELECT file_uid, file_ext
            FROM media_files
            WHERE owner_type = 'user' AND owner_id = %s AND purpose = 'avatar'
            """,
            (user_id,),
        )
        rows = cur.fetchall()
        for row in rows:
            try:
                os.remove(_avatar_disk_path(row["file_uid"], row["file_ext"]))
            except FileNotFoundError:
                pass
            except Exception as exc:
                logging.warning("Avatar file cleanup failed: %s", exc)
        cur.execute(
            """
            DELETE FROM media_files
            WHERE owner_type = 'user' AND owner_id = %s AND purpose = 'avatar'
            """,
            (user_id,),
        )
    finally:
        cur.close()

def _find_avatar_meta(conn, user_id: int):
    """
    Load avatar metadata (DB) or fall back to legacy file if DB is empty.
    """
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """
            SELECT file_uid, file_ext, storage_path
            FROM media_files
            WHERE owner_type = 'user' AND owner_id = %s AND purpose = 'avatar'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user_id,),
        )
        row = cur.fetchone()
    finally:
        cur.close()

    if row:
        return row

    # Legacy fallback: look for old files under uploads/avatars
    path, ext = _find_legacy_avatar(user_id)
    if path and ext:
        legacy_rel = f"/uploads/avatars/user_{user_id}{ext}"
        return {"file_uid": f"legacy-{user_id}", "file_ext": ext, "storage_path": legacy_rel}

    return None

def _delete_post_images(conn, post_id: int):
    """
    Remove DB rows + files for a post's images (current implementation keeps one).
    """
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """
            SELECT file_uid, file_ext
            FROM media_files
            WHERE owner_type = 'post' AND owner_id = %s AND purpose = 'post_image'
            """,
            (post_id,),
        )
        rows = cur.fetchall()
        for row in rows:
            try:
                os.remove(_post_image_disk_path(row["file_uid"], row["file_ext"]))
            except FileNotFoundError:
                pass
            except Exception as exc:
                logging.warning("Post image cleanup failed: %s", exc)
        cur.execute(
            """
            DELETE FROM media_files
            WHERE owner_type = 'post' AND owner_id = %s AND purpose = 'post_image'
            """,
            (post_id,),
        )
    finally:
        cur.close()


def _delete_post_image_by_uid(conn, post_id: int, file_uid: str):
    """
    Remove a single image by uid for given post.
    """
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """
            SELECT file_uid, file_ext, storage_path
            FROM media_files
            WHERE owner_type = 'post' AND owner_id = %s AND purpose = 'post_image' AND file_uid = %s
            """,
            (post_id, file_uid),
        )
        row = cur.fetchone()
        if not row:
            return False
        try:
            os.remove(_post_image_disk_path(row["file_uid"], row["file_ext"]))
        except FileNotFoundError:
            pass
        except Exception as exc:
            logging.warning("Post image cleanup failed: %s", exc)
        cur.execute(
            """
            DELETE FROM media_files
            WHERE owner_type = 'post' AND owner_id = %s AND purpose = 'post_image' AND file_uid = %s
            """,
            (post_id, file_uid),
        )
        return True
    finally:
        cur.close()


def _next_post_image_sort(conn, post_id: int) -> int:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT COALESCE(MAX(sort_order) + 1, 0) AS nxt
            FROM media_files
            WHERE owner_type = 'post' AND owner_id = %s AND purpose = 'post_image'
            """,
            (post_id,),
        )
        row = cur.fetchone()
        nxt = int(row[0]) if row and row[0] is not None else 0
        return max(1, nxt)  # rezervujeme 0 pre hlavný obrázok
    finally:
        cur.close()


def _insert_post_image_record(
    conn,
    post_id: int,
    *,
    file_uid: str,
    filename: str,
    ext: str,
    mime_type: str | None,
    size_bytes: int,
    storage_path: str,
    is_main: bool = False,
):
    """
    Insert media_files row and update posts.image depending on main flag.
    Keeps current main (sort_order 0) intact unless is_main=True is passed.
    """
    storage_url = _make_abs(storage_path)
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """
            SELECT file_uid
            FROM media_files
            WHERE owner_type = 'post' AND owner_id = %s AND purpose = 'post_image' AND sort_order = 0
            LIMIT 1
            """,
            (post_id,),
        )
        existing_main = cur.fetchone()
        has_main = bool(existing_main)
        make_main = is_main or not has_main

        if make_main and has_main:
            cur.execute(
                """
                UPDATE media_files
                SET sort_order = %s
                WHERE owner_type = 'post' AND owner_id = %s AND purpose = 'post_image' AND file_uid = %s
                """,
                (_next_post_image_sort(conn, post_id), post_id, existing_main["file_uid"]),
            )
            sort_order = 0
        elif make_main:
            sort_order = 0
        else:
            sort_order = _next_post_image_sort(conn, post_id)

        cur.execute(
            """
            INSERT INTO media_files
              (owner_type, owner_id, purpose, sort_order, file_uid, file_name, file_ext, mime_type, size_bytes, storage_path)
            VALUES
              ('post', %s, 'post_image', %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                post_id,
                sort_order,
                file_uid,
                filename,
                ext,
                mime_type,
                size_bytes,
                storage_path,
            ),
        )

        if make_main:
            cur.execute("UPDATE posts SET image = %s WHERE id_post = %s", (storage_url, post_id))
        else:
            cur.execute("UPDATE posts SET image = COALESCE(image, %s) WHERE id_post = %s", (storage_url, post_id))

        conn.commit()
        return storage_url, sort_order
    finally:
        cur.close()


def _resequence_post_images(conn, post_id: int):
    """
    Normalize sort_order: main stays at 0 (if present), others start at 1. Does not auto-promote other images.
    """
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """
            SELECT file_uid, storage_path, sort_order
            FROM media_files
            WHERE owner_type = 'post' AND owner_id = %s AND purpose = 'post_image'
            ORDER BY sort_order ASC, created_at ASC
            """,
            (post_id,),
        )
        rows = cur.fetchall()
        main_url = None
        has_main = False
        next_idx = 1
        for row in rows:
            if row.get("sort_order") == 0 and not has_main:
                target = 0
                has_main = True
                if row.get("storage_path"):
                    main_url = _make_abs(row["storage_path"])
            else:
                target = next_idx
                next_idx += 1

            if row.get("sort_order") != target:
                cur.execute(
                    """
                    UPDATE media_files
                    SET sort_order = %s
                    WHERE owner_type = 'post' AND owner_id = %s AND purpose = 'post_image' AND file_uid = %s
                    """,
                    (target, post_id, row["file_uid"]),
                )

        cur.execute("UPDATE posts SET image = %s WHERE id_post = %s", (main_url, post_id))
        conn.commit()
        return main_url
    finally:
        cur.close()


def _make_abs(url: str) -> str:
    """
    Prefix relative /path with current host so frontend that uses post.image directly bude mať plnú URL.
    """
    if not url:
        return url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    base = (request.host_url or "").rstrip("/")
    return f"{base}{url}"


def _delete_activity_image(conn, activity_id: int):
    """
    Remove DB rows and files for single activity image.
    """
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """
            SELECT file_uid, file_ext
            FROM media_files
            WHERE owner_type = 'activity' AND owner_id = %s AND purpose = 'activity_image'
            """,
            (activity_id,),
        )
        rows = cur.fetchall()
        for row in rows:
            try:
                os.remove(_activity_image_disk_path(row["file_uid"], row["file_ext"]))
            except FileNotFoundError:
                pass
            except Exception as exc:
                logging.warning("Activity image cleanup failed: %s", exc)

        cur.execute(
            """
            DELETE FROM media_files
            WHERE owner_type = 'activity' AND owner_id = %s AND purpose = 'activity_image'
            """,
            (activity_id,),
        )
        cur.execute("UPDATE activities SET image_url = NULL WHERE id_activity = %s", (activity_id,))
        conn.commit()
    finally:
        cur.close()


def _delete_article_image(conn, article_id: int):
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """
            SELECT file_uid, file_ext
            FROM media_files
            WHERE owner_type = 'article' AND owner_id = %s AND purpose = 'attachment'
            """,
            (article_id,),
        )
        rows = cur.fetchall()
        for row in rows:
            try:
                os.remove(_article_image_disk_path(row["file_uid"], row["file_ext"]))
            except FileNotFoundError:
                pass
            except Exception as exc:
                logging.warning("Article image cleanup failed: %s", exc)
        cur.execute(
            """
            DELETE FROM media_files
            WHERE owner_type = 'article' AND owner_id = %s AND purpose = 'attachment'
            """,
            (article_id,),
        )
    finally:
        cur.close()


def _save_activity_image_from_data_url(conn, activity_id: int, data_url: str):
    """
    Decode data:image payload, persist to disk + media_files, update activities.image_url.
    """
    if not data_url or not isinstance(data_url, str) or not data_url.startswith("data:image"):
        return None

    match = re.match(r"data:image/(png|jpeg|jpg|gif|webp);base64,(.+)", data_url, re.IGNORECASE | re.DOTALL)
    if not match:
        return None

    ext_raw, b64data = match.groups()
    ext = "." + ext_raw.lower().replace("jpeg", "jpg")
    if ext not in ALLOWED_IMAGE_EXTS:
        return None

    try:
        blob = base64.b64decode(b64data)
    except Exception as exc:
        logging.warning("Activity image base64 decode failed: %s", exc)
        return None

    file_uid = str(uuid.uuid4())
    path = _activity_image_disk_path(file_uid, ext)
    try:
        with open(path, "wb") as f:
            f.write(blob)
    except Exception as exc:
        logging.warning("Activity image save failed: %s", exc)
        return None

    size_bytes = os.path.getsize(path)
    storage_path = f"/assets/img/activities/{file_uid}{ext}"
    storage_url = _make_abs(storage_path)

    # keep single image: drop previous rows/files first
    _delete_activity_image(conn, activity_id)

    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO media_files
              (owner_type, owner_id, purpose, sort_order, file_uid, file_name, file_ext, mime_type, size_bytes, storage_path)
            VALUES
              ('activity', %s, 'activity_image', 0, %s, %s, %s, %s, %s, %s)
            """,
            (
                activity_id,
                file_uid,
                f"activity_{activity_id}{ext}",
                ext,
                f"image/{ext.strip('.')}",
                size_bytes,
                storage_path,
            ),
        )
        cur.execute("UPDATE activities SET image_url = %s WHERE id_activity = %s", (storage_url, activity_id))
        conn.commit()
        return storage_url
    except Exception as exc:
        try:
            os.remove(path)
        except Exception:
            pass
        logging.warning("Activity image DB save failed: %s", exc)
        return None
    finally:
        cur.close()


def _save_post_image_from_data_url(conn, post_id: int, data_url: str):
    """
    Decode a data:image/...;base64 payload, save to disk, insert into media_files and posts.image.
    Returns storage_path or None.
    """
    if not data_url or not data_url.startswith("data:image"):
        return None


def _save_article_image_from_data_url(conn, article_id: int, data_url: str):
    """
    Decode data:image payload for article, save to disk + media_files, update articles.image_url.
    """
    if not data_url or not isinstance(data_url, str) or not data_url.startswith("data:image"):
        return None

    match = re.match(r"data:image/(png|jpeg|jpg|gif|webp);base64,(.+)", data_url, re.IGNORECASE | re.DOTALL)
    if not match:
        return None

    ext_raw, b64data = match.groups()
    ext = "." + ext_raw.lower().replace("jpeg", "jpg")
    if ext not in ALLOWED_IMAGE_EXTS:
        return None

    try:
        blob = base64.b64decode(b64data)
    except Exception as exc:
        logging.warning("Article image base64 decode failed: %s", exc)
        return None

    file_uid = str(uuid.uuid4())
    path = _article_image_disk_path(file_uid, ext)
    try:
        with open(path, "wb") as f:
            f.write(blob)
    except Exception as exc:
        logging.warning("Article image save failed: %s", exc)
        return None

    size_bytes = os.path.getsize(path)
    storage_path = f"/assets/img/articles/{file_uid}{ext}"
    storage_url = _make_abs(storage_path)

    _delete_article_image(conn, article_id)

    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO media_files
              (owner_type, owner_id, purpose, sort_order, file_uid, file_name, file_ext, mime_type, size_bytes, storage_path)
            VALUES
              ('article', %s, 'attachment', 0, %s, %s, %s, %s, %s, %s)
            """,
            (
                article_id,
                file_uid,
                f"article_{article_id}{ext}",
                ext,
                f"image/{ext.strip('.')}",
                size_bytes,
                storage_path,
            ),
        )
        cur.execute("UPDATE articles SET image_url = %s WHERE id_article = %s", (storage_url, article_id))
        conn.commit()
        return storage_url
    except Exception as exc:
        try:
            os.remove(path)
        except Exception:
            pass
        logging.warning("Article image DB save failed: %s", exc)
        return None
    finally:
        cur.close()

    match = re.match(r"data:image/(png|jpeg|jpg|gif|webp);base64,(.+)", data_url, re.IGNORECASE | re.DOTALL)
    if not match:
        return None

    ext_raw, b64data = match.groups()
    ext = "." + ext_raw.lower().replace("jpeg", "jpg")
    if ext not in ALLOWED_IMAGE_EXTS:
        return None

    try:
        blob = base64.b64decode(b64data)
    except Exception as exc:
        logging.warning("Post image base64 decode failed: %s", exc)
        return None

    file_uid = str(uuid.uuid4())
    path = _post_image_disk_path(file_uid, ext)
    try:
        with open(path, "wb") as f:
            f.write(blob)
    except Exception as exc:
        logging.warning("Post image save failed: %s", exc)
        return None

    size_bytes = os.path.getsize(path)
    storage_path = f"/assets/img/posts/{file_uid}{ext}"
    try:
        storage_url, _ = _insert_post_image_record(
            conn,
            post_id,
            file_uid=file_uid,
            filename=f"post_{post_id}{ext}",
            ext=ext,
            mime_type=f"image/{ext.strip('.')}",
            size_bytes=size_bytes,
            storage_path=storage_path,
            is_main=True,
        )
        return storage_url
    except Exception as exc:
        try:
            os.remove(path)
        except Exception:
            pass
        logging.warning("Post image save failed: %s", exc)
        return None

# 🔒 Validácia hesla
def validate_password(password):
    """
    Kontroluje bezpečnosť hesla:
    - Min 8 znakov
    - Aspoň 1 veľké písmeno
    - Aspoň 1 malé písmeno
    - Aspoť 1 číslo
    - Aspoň 1 špeciálny znak
    """
    if len(password) < 8:
        return False, "Heslo musí mať aspoň 8 znakov."
    
    if not re.search(r"[A-Z]", password):
        return False, "Heslo musí obsahovať aspoň jedno veľké písmeno."
    
    if not re.search(r"[a-z]", password):
        return False, "Heslo musí obsahovať aspoň jedno malé písmeno."
    
    if not re.search(r"\d", password):
        return False, "Heslo musí obsahovať aspoň jedno číslo."
    
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Heslo musí obsahovať aspoň jeden špeciálny znak (!@#$%^&* atď.)."
    
    return True, ""

# ==========================================
# 🎨 ZÍSKANIE VŠETKÝCH HOBBY
# ==========================================

@app.get("/api/hobby-categories")
def get_hobby_categories():
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT 
                hk.id_kategoria,
                hk.nazov,
                hk.ikona,
                COUNT(h.id_hobby) as pocet_hobby
            FROM hobby_kategoria hk
            LEFT JOIN hobby h ON h.id_kategoria = hk.id_kategoria
            GROUP BY hk.id_kategoria
            ORDER BY hk.id_kategoria ASC
        """)
        categories = cur.fetchall()
        return jsonify(categories), 200
    except Exception as e:
        return jsonify({"error": f"Chyba pri načítaní kategórií: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@app.get("/api/hobbies")
def get_hobbies():
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT 
                h.id_hobby,
                h.nazov,
                h.id_kategoria,
                hk.nazov as kategoria_nazov,
                hk.ikona as kategoria_ikona
            FROM hobby h
            LEFT JOIN hobby_kategoria hk ON h.id_kategoria = hk.id_kategoria
            ORDER BY hk.id_kategoria ASC, h.nazov ASC
        """)
        hobbies = cur.fetchall()
        return jsonify(hobbies), 200
    except Exception as e:
        return jsonify({"error": f"Chyba pri načítaní hobby: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()

# ==========================================
# 👤 REGISTRÁCIA
# ==========================================
@app.post("/api/register")
def register_user():
    data = request.get_json(force=True)
    name = data.get("name")
    surname = data.get("surname")
    email = data.get("email")
    password = data.get("password")
    password_confirm = data.get("password_confirm")
    birthdate = data.get("birthdate")
    hobbies = data.get("hobbies", [])  # Array ID hobby

    # ✅ Kontrola povinných polí
    if not all([name, surname, email, password, password_confirm, birthdate]):
        return jsonify({"error": "Všetky polia sú povinné."}), 400

    # ✅ Kontrola zhody hesiel
    if password != password_confirm:
        return jsonify({"error": "Heslá sa nezhodujú."}), 400

    # ✅ Validácia bezpečnosti hesla
    is_valid, error_msg = validate_password(password)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    # ✅ Hash hesla
    hashed_pw = bcrypt.generate_password_hash(password, 12).decode("utf-8")

    # ✅ Formát dátumu
    try:
        birthdate_obj = datetime.strptime(birthdate, "%Y-%m-%d")
        birthdate_formatted = birthdate_obj.strftime("%Y-%m-%d")
    except Exception:
        return jsonify({"error": "Neplatný formát dátumu (použi YYYY-MM-DD)"}), 400

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        
        # ✅ Kontrola, či email už existuje
        cur.execute("SELECT id_user FROM users WHERE mail = %s", (email,))
        if cur.fetchone():
            return jsonify({"error": "Tento email je už zaregistrovaný."}), 409
        
        # ✅ Vloženie nového používateľa
        cur.execute(
            """
            INSERT INTO users (meno, priezvisko, mail, heslo, datum_narodenia)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (name, surname, email, hashed_pw, birthdate_formatted)
        )
        conn.commit()
        
        # ✅ Získanie ID novo vytvoreného používateľa
        user_id = cur.lastrowid
        
        # ✅ Vloženie hobby do user_hobby tabuľky
        if hobbies and len(hobbies) > 0:
            for hobby_id in hobbies:
                cur.execute(
                    "INSERT INTO user_hobby (id_user, id_hobby) VALUES (%s, %s)",
                    (user_id, hobby_id)
                )
            conn.commit()
        try:
            generate_and_save_user_embedding(user_id)
        except Exception as emb_err:
            logging.warning(
                "Failed to generate user embedding for %s: %s",
                user_id,
                emb_err,
            )
        return jsonify({
            "success": True, 
            "user": f"{name} {surname}",
            "hobbies_count": len(hobbies)
        }), 201
        
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Chyba databázy: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()

# ==========================================
# 🔐 PRIHLÁSENIE
# ==========================================
@app.post("/api/login")
def login_user():
    data = request.get_json(force=True)
    email = data.get("email")
    password = data.get("password")

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM users WHERE mail = %s", (email,))
        user = cur.fetchone()

        if not user:
            return jsonify({"error": "Používateľ neexistuje."}), 404

        if not bcrypt.check_password_hash(user["heslo"], password):
            return jsonify({"error": "Nesprávne heslo."}), 401

        return jsonify({
            "success": True,
            "user": {
                "id": user["id_user"],
                "name": user["meno"],
                "surname": user["priezvisko"],
                "email": user["mail"],
                "birthdate": user["datum_narodenia"],
                "role": user.get("rola") or "user",   # 👈 dôležité
            }
        }), 200
    finally:
        cur.close()
        conn.close()

# ==========================================
# 👥 POUŽÍVATELIA – LIST (s ratingmi)
# ==========================================
@app.get("/api/users")
def get_users():
    q = request.args.get("q", "").strip()
    sort = request.args.get("sort", "id_desc").lower()  # id_desc | id_asc | name_asc | name_desc | rating_desc | rating_asc | relevance
    role_filter = request.args.get("role", "").strip()

    # stránkovanie
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(100, max(1, int(request.args.get("page_size", 50))))
    except (TypeError, ValueError):
        page_size = 50
    offset = (page - 1) * page_size

    # základné sortovanie podľa usera / ratingu
    base_sort_sql = {
        "id_desc": "u.id_user DESC",
        "id_asc": "u.id_user ASC",
        "name_asc": "u.meno ASC, u.priezvisko ASC",
        "name_desc": "u.meno DESC, u.priezvisko DESC",
        "rating_desc": "r.avg_rating IS NULL, r.avg_rating DESC, r.rating_count DESC, u.id_user DESC",
        "rating_asc": "r.avg_rating IS NULL, r.avg_rating ASC, r.rating_count DESC, u.id_user DESC",
    }.get(sort, "u.id_user DESC")

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)

        where = ["u.soft_del = 0"]
        params = []

        score_sql = "0"  # default (bez q)
        score_params = []

        allowed_roles = {"user_dobrovolnik", "user_firma", "user_senior"}
        if role_filter and role_filter in allowed_roles:
            where.append("u.rola = %s")
            params.append(role_filter)

        if q:
            like_any = f"%{q}%"
            like_prefix = f"{q}%"
            like_fullname_prefix = f"{q}%"

            where.append(
                "(u.meno LIKE %s OR u.priezvisko LIKE %s OR u.mail LIKE %s OR "
                "CONCAT(u.meno,' ',u.priezvisko) LIKE %s)"
            )
            params += [like_any, like_any, like_any, like_any]

            score_sql = """
                (CASE WHEN CONCAT(u.meno,' ',u.priezvisko) = %s THEN 100 ELSE 0 END) +
                (CASE WHEN CONCAT(u.meno,' ',u.priezvisko) LIKE %s THEN 60 ELSE 0 END) +
                (CASE WHEN u.meno LIKE %s THEN 40 ELSE 0 END) +
                (CASE WHEN u.priezvisko LIKE %s THEN 35 ELSE 0 END) +
                (CASE WHEN u.mail LIKE %s THEN 20 ELSE 0 END) +
                (CASE WHEN u.meno LIKE %s THEN 10 ELSE 0 END) +
                (CASE WHEN u.priezvisko LIKE %s THEN 8 ELSE 0 END) +
                (CASE WHEN u.mail LIKE %s THEN 5 ELSE 0 END)
            """
            score_params = [
                q,
                like_fullname_prefix,
                like_prefix, like_prefix, like_prefix,
                like_any, like_any, like_any
            ]

        where_sql = " AND ".join(where)

        # ak je fulltext (q), ale sort nie je rating_desc/asc, triedime primárne podľa relevancie
        if q:
            if sort in ("rating_desc", "rating_asc"):
                sort_sql = base_sort_sql
            else:
                sort_sql = "score DESC, u.meno ASC, u.priezvisko ASC"
        else:
            sort_sql = base_sort_sql

        # total
        cur.execute(
            f"SELECT COUNT(*) AS total FROM users u WHERE {where_sql}",
            params,
        )
        total = cur.fetchone()["total"]

        # data (JOIN na agregované ratingy)
        if q:
            cur.execute(
                f"""
                SELECT 
                    u.id_user,
                    u.meno,
                    u.priezvisko,
                    u.mail,
                    u.rola,
                    r.avg_rating,
                    r.rating_count,
                    {score_sql} AS score
                FROM users u
                LEFT JOIN (
                    SELECT user_id,
                           AVG(rating) AS avg_rating,
                           COUNT(*)    AS rating_count
                    FROM user_ratings
                    GROUP BY user_id
                ) r ON r.user_id = u.id_user
                WHERE {where_sql}
                ORDER BY {sort_sql}
                LIMIT %s OFFSET %s
                """,
                # score placeholders come first in SELECT, then WHERE params
                score_params + params + [page_size, offset],
            )
        else:
            cur.execute(
                f"""
                SELECT 
                    u.id_user,
                    u.meno,
                    u.priezvisko,
                    u.mail,
                    u.rola,
                    r.avg_rating,
                    r.rating_count
                FROM users u
                LEFT JOIN (
                    SELECT user_id,
                           AVG(rating) AS avg_rating,
                           COUNT(*)    AS rating_count
                    FROM user_ratings
                    GROUP BY user_id
                ) r ON r.user_id = u.id_user
                WHERE {where_sql}
                ORDER BY {sort_sql}
                LIMIT %s OFFSET %s
                """,
                params + [page_size, offset],
            )

        rows = [_normalize_user_rating_fields(dict(row)) for row in cur.fetchall()]

        if not q:
            return jsonify(rows), 200

        return jsonify({
            "items": rows,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "pages": (total + page_size - 1) // page_size
            }
        }), 200
    finally:
        cur.close()
        conn.close()

# ==========================================
# 👥 POUŽÍVATELIA – DELETE
# ==========================================
@app.delete("/api/users/<int:user_id>")
def delete_user(user_id: int):
    # voliteľné – superadmin (id 1) sa nedá zmazať
    if user_id == 1:
        return jsonify({"error": "Hlavného admina nie je možné zmazať."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()

        # soft delete – aby sa ďalej neukazoval v zoznamoch
        cur.execute(
            "UPDATE users SET soft_del = 1 WHERE id_user = %s AND soft_del = 0",
            (user_id,),
        )

        if cur.rowcount == 0:
            return jsonify({
                "error": "Používateľ neexistuje alebo je už zmazaný."
            }), 404

        conn.commit()
        return jsonify({"success": True}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Chyba pri mazaní používateľa: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()

# ==========================================
# HODNOTENIA POUZIVATELOV
# ==========================================

def _serialize_rating_row(row):
    if not row:
        return None
    created_at = row.get("created_at")
    if isinstance(created_at, datetime):
        created_at_str = created_at.isoformat()
    else:
        created_at_str = created_at
    first = (row.get("meno") or "").strip()
    last = (row.get("priezvisko") or "").strip()
    full_name = " ".join(part for part in [first, last] if part).strip()
    return {
        "id_rating": row.get("id_rating"),
        "user_id": row.get("user_id"),
        "rated_by_user_id": row.get("rated_by_user_id"),
        "rating": row.get("rating"),
        "comment": row.get("comment"),
        "created_at": created_at_str,
        "rated_by_name": full_name or None,
    }


def _normalize_user_rating_fields(row):
    if not row:
        return row
    if "avg_rating" in row:
        val = row.get("avg_rating")
        if val is None:
            row["avg_rating"] = None
        else:
            try:
                row["avg_rating"] = float(val)
            except (TypeError, ValueError):
                row["avg_rating"] = None
    if "rating_count" in row:
        val = row.get("rating_count")
        if val is None:
            row["rating_count"] = 0
        else:
            try:
                row["rating_count"] = int(val)
            except (TypeError, ValueError):
                row["rating_count"] = 0
    return row


@app.get("/api/users/<int:user_id>/ratings")
def get_user_ratings(user_id):
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1

    limit_arg = request.args.get("limit")
    try:
        default_page_size = int(limit_arg) if limit_arg is not None else 5
    except (TypeError, ValueError):
        default_page_size = 5

    try:
        page_size = int(request.args.get("page_size", default_page_size))
    except (TypeError, ValueError):
        page_size = default_page_size
    page_size = max(1, min(50, page_size))
    offset = (page - 1) * page_size

    rated_by_param = request.args.get("rated_by")
    try:
        rated_by_user_id = int(rated_by_param) if rated_by_param is not None else None
    except (TypeError, ValueError):
        rated_by_user_id = None

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT COUNT(*) AS total, AVG(rating) AS avg_rating
            FROM user_ratings
            WHERE user_id = %s
        """, (user_id,))
        stats_row = cur.fetchone() or {"total": 0, "avg_rating": None}
        avg_rating = stats_row.get("avg_rating")
        avg_value = float(avg_rating) if avg_rating is not None else None
        total = int(stats_row.get("total") or 0)

        cur.execute("""
            SELECT r.id_rating, r.user_id, r.rated_by_user_id, r.rating, r.comment, r.created_at,
                   u.meno, u.priezvisko
            FROM user_ratings r
            LEFT JOIN users u ON u.id_user = r.rated_by_user_id
            WHERE r.user_id = %s
            ORDER BY r.created_at DESC
            LIMIT %s OFFSET %s
        """, (user_id, page_size, offset))
        rows = [_normalize_user_rating_fields(dict(row)) for row in cur.fetchall()]
        items = [item for item in (_serialize_rating_row(row) for row in rows) if item]

        my_rating = None
        if rated_by_user_id:
            cur.execute("""
                SELECT r.id_rating, r.user_id, r.rated_by_user_id, r.rating, r.comment, r.created_at,
                       u.meno, u.priezvisko
                FROM user_ratings r
                LEFT JOIN users u ON u.id_user = r.rated_by_user_id
                WHERE r.user_id = %s AND r.rated_by_user_id = %s
                LIMIT 1
            """, (user_id, rated_by_user_id))
            my_rating = _serialize_rating_row(cur.fetchone())

        total_pages = (total + page_size - 1) // page_size

        return jsonify({
            "items": items,
            "stats": {
                "average": avg_value,
                "count": total,
            },
            "my_rating": my_rating,
            "page": page,
            "page_size": page_size,
            "total": total,
            "pages": total_pages,
        }), 200
    except Exception as e:
        return jsonify({"error": f"Chyba pri nacitani hodnoteni: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@app.get("/api/users/top-rated")
def get_top_rated_users():
    try:
        limit = max(1, min(20, int(request.args.get("limit", 6))))
    except (TypeError, ValueError):
        limit = 5
    try:
        days = max(1, min(90, int(request.args.get("days", 7))))
    except (TypeError, ValueError):
        days = 7

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT u.id_user,
                   u.meno,
                   u.priezvisko,
                   u.mail,
                   u.rola,
                   AVG(r.rating) AS avg_rating,
                   COUNT(*) AS rating_count
            FROM user_ratings r
            JOIN users u ON u.id_user = r.user_id
            WHERE r.created_at >= NOW() - INTERVAL %s DAY
              AND u.soft_del = 0
            GROUP BY u.id_user, u.meno, u.priezvisko, u.mail, u.rola
            HAVING rating_count > 0
            ORDER BY avg_rating DESC, rating_count DESC, u.id_user DESC
            LIMIT %s
            """,
            (days, limit),
        )
        rows = [_normalize_user_rating_fields(row) for row in cur.fetchall()]
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": f"Chyba pri nacitani hodnoteni: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@app.post("/api/users/<int:user_id>/ratings")
def upsert_user_rating(user_id):
    data = request.get_json(force=True)
    rated_by_user_id = data.get("rated_by_user_id")
    rating_value = data.get("rating")
    comment = (data.get("comment") or "").strip()

    try:
        rated_by_user_id = int(rated_by_user_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Neplatne ID hodnotiaceho pouzivatela."}), 400

    if rated_by_user_id == user_id:
        return jsonify({"error": "Pouzivatel sa nemoze hodnotit sam."}), 400

    try:
        rating_value = int(rating_value)
    except (TypeError, ValueError):
        return jsonify({"error": "Neplatna hodnota ratingu."}), 400

    if rating_value < 1 or rating_value > 5:
        return jsonify({"error": "Hodnotenie musi byt v rozsahu 1 az 5."}), 400

    if not comment:
        comment = None
    elif len(comment) > 1000:
        comment = comment[:1000]

    conn = get_conn()
    cur = None
    write_cur = None
    detail_cur = None
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id_user FROM users WHERE id_user IN (%s, %s)", (user_id, rated_by_user_id))
        ids = {row["id_user"] for row in cur.fetchall()}
        if user_id not in ids:
            return jsonify({"error": "Hodnoteny pouzivatel neexistuje."}), 404
        if rated_by_user_id not in ids:
            return jsonify({"error": "Hodnotiaci pouzivatel neexistuje."}), 400

        cur.execute("""
            SELECT id_rating
            FROM user_ratings
            WHERE user_id = %s AND rated_by_user_id = %s
        """, (user_id, rated_by_user_id))
        existing = cur.fetchone()
        cur.close()
        cur = None

        write_cur = conn.cursor()
        if existing:
            write_cur.execute("""
                UPDATE user_ratings
                SET rating = %s, comment = %s, created_at = NOW()
                WHERE id_rating = %s
            """, (rating_value, comment, existing["id_rating"]))
            status_code = 200
        else:
            write_cur.execute("""
                INSERT INTO user_ratings (user_id, rated_by_user_id, rating, comment)
                VALUES (%s, %s, %s, %s)
            """, (user_id, rated_by_user_id, rating_value, comment))
            status_code = 201
        conn.commit()
        write_cur.close()
        write_cur = None

        detail_cur = conn.cursor(dictionary=True)
        detail_cur.execute("""
            SELECT r.id_rating, r.user_id, r.rated_by_user_id, r.rating, r.comment, r.created_at,
                   u.meno, u.priezvisko
            FROM user_ratings r
            LEFT JOIN users u ON u.id_user = r.rated_by_user_id
            WHERE r.user_id = %s AND r.rated_by_user_id = %s
            LIMIT 1
        """, (user_id, rated_by_user_id))
        saved = _serialize_rating_row(detail_cur.fetchone())

        return jsonify({"message": "Hodnotenie ulozene.", "rating": saved}), status_code
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Chyba pri ukladani hodnotenia: {str(e)}"}), 500
    finally:
        if cur:
            cur.close()
        if write_cur:
            write_cur.close()
        if detail_cur:
            detail_cur.close()
        conn.close()

# ==========================================
# 💬 CHAT – CONVERSATIONS & MESSAGES
# ==========================================

@app.post("/api/chat/conversations")
def create_or_get_conversation():
    data = request.get_json(force=True) or {}
    user_ids = data.get("user_ids")
    title = (data.get("title") or "").strip()

    if not isinstance(user_ids, list) or len(user_ids) < 2:
        return jsonify({"error": "Potrebujem aspoň dvoch účastníkov."}), 400

    # odstránime duplicity + zoradíme, nech je to deterministické
    user_ids = sorted({int(uid) for uid in user_ids})
    is_group = len(user_ids) > 2

    # title používame len pre skupiny; pre 1:1 ho ignorujeme
    if is_group and not title:
        return jsonify({"error": "Chýba názov skupiny."}), 400

    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        # 1:1 – nájdi existujúcu konverzáciu s presne tými účastníkmi
        # (pozor: pôvodný WHERE cp.id_user IN (...) vedel omylom trafiť aj skupinu)
        if not is_group:
            placeholders = ", ".join(["%s"] * len(user_ids))
            query = f"""
                SELECT MIN(c.id_conversation) AS id_conversation
                FROM conversations c
                JOIN conversation_participants cp ON cp.id_conversation = c.id_conversation
                GROUP BY c.id_conversation
                HAVING
                  SUM(CASE WHEN cp.id_user IN ({placeholders}) THEN 1 ELSE 0 END) = %s
                  AND COUNT(*) = %s
                LIMIT 1
            """
            cur.execute(query, (*user_ids, len(user_ids), len(user_ids)))
            row = cur.fetchone()
            if row and row.get("id_conversation"):
                return jsonify({"id_conversation": row["id_conversation"], "created": False}), 200

        # Skupina (alebo nové 1:1) – vytvoríme novú konverzáciu
        if is_group:
            cur.execute("INSERT INTO conversations (title) VALUES (%s)", (title,))
        else:
            cur.execute("INSERT INTO conversations () VALUES ()")

        conv_id = cur.lastrowid

        cur.executemany(
            "INSERT INTO conversation_participants (id_conversation, id_user) VALUES (%s, %s)",
            [(conv_id, uid) for uid in user_ids],
        )
        conn.commit()

        return jsonify({"id_conversation": conv_id, "created": True}), 201

    finally:
        cur.close()
        conn.close()


@app.get("/api/chat/conversations")
def list_conversations():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"error": "Chýba user_id."}), 400

    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """
            SELECT
              c.id_conversation,
              c.title,
              COUNT(DISTINCT cp.id_user) AS participant_count,
              (COUNT(DISTINCT cp.id_user) > 2) AS is_group,

              MAX(m.created_at) AS last_message_at,
              SUBSTRING_INDEX(
                  MAX(CONCAT(m.created_at, '|||', m.content)),
                  '|||', -1
              ) AS last_message,
              GROUP_CONCAT(DISTINCT cp.id_user) AS participant_ids,

              -- "ten druhý" používateľ v 1:1 chate (pre skupiny sa ignoruje)
              MAX(CASE WHEN cp.id_user <> %s THEN cp.id_user END) AS other_user_id,
              MAX(
                CASE
                  WHEN cp.id_user <> %s THEN CONCAT(u.meno, ' ', u.priezvisko)
                  ELSE NULL
                END
              ) AS other_user_name,

              -- UI-friendly názov konverzácie:
              CASE
                WHEN c.title IS NOT NULL AND c.title <> '' THEN c.title
                WHEN COUNT(DISTINCT cp.id_user) = 2 THEN
                  MAX(CASE WHEN cp.id_user <> %s THEN CONCAT(u.meno, ' ', u.priezvisko) END)
                ELSE CONCAT('Skupina (', COUNT(DISTINCT cp.id_user), ')')
              END AS display_title,

              -- počet neprečítaných správ pre aktuálneho používateľa
              (
                SELECT COUNT(*)
                FROM messages m2
                WHERE m2.id_conversation = c.id_conversation
                  AND (cp_me.last_read_message_id IS NULL OR m2.id_message > cp_me.last_read_message_id)
                  AND m2.sender_id <> %s
              ) AS unread_count

            FROM conversations c

            JOIN conversation_participants cp_me
              ON cp_me.id_conversation = c.id_conversation
             AND cp_me.id_user = %s

            JOIN conversation_participants cp
              ON cp.id_conversation = c.id_conversation
            JOIN users u
              ON u.id_user = cp.id_user

            LEFT JOIN messages m
              ON m.id_conversation = c.id_conversation

            GROUP BY c.id_conversation
            ORDER BY last_message_at DESC
            """,
            (user_id, user_id, user_id, user_id, user_id),
        )

        rows = cur.fetchall()
        return jsonify(rows), 200

    finally:
        cur.close()
        conn.close()


@app.get("/api/chat/conversations/<int:conv_id>/messages")
def get_messages(conv_id):
    page = request.args.get("page", default=1, type=int)
    page_size = request.args.get("page_size", default=50, type=int)
    offset = (page - 1) * page_size
    user_id = request.args.get("user_id", type=int)

    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        # načítaj správy
        cur.execute(
            """
            SELECT
              m.id_message,
              m.sender_id,
              m.content,
              m.created_at,
              m.is_edited,
              m.edited_at,
              u.meno,
              u.priezvisko
            FROM messages m
            JOIN users u ON u.id_user = m.sender_id
            WHERE m.id_conversation = %s
            ORDER BY m.created_at ASC
            LIMIT %s OFFSET %s
            """,
            (conv_id, page_size, offset),
        )
        rows = cur.fetchall()

        # ak vieme, kto je aktuálny používateľ, označ všetky doteraz načítané správy ako prečítané
        if user_id is not None and rows:
            max_id = max(row["id_message"] for row in rows)
            cur.execute(
                """
                UPDATE conversation_participants
                SET last_read_message_id = %s,
                    last_read_at = NOW()
                WHERE id_conversation = %s
                  AND id_user = %s
                """,
                (max_id, conv_id, user_id),
            )
            conn.commit()

        return jsonify(rows), 200
    finally:
        cur.close()
        conn.close()


@app.post("/api/chat/conversations/<int:conv_id>/messages")
def send_message(conv_id):
    data = request.get_json(force=True) or {}
    sender_id = data.get("sender_id")
    content = (data.get("content") or "").strip()

    if not sender_id or not content:
        return jsonify({"error": "Chýba odosielateľ alebo obsah."}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO messages (id_conversation, sender_id, content) VALUES (%s, %s, %s)",
            (conv_id, sender_id, content),
        )
        conn.commit()
        msg_id = cur.lastrowid

        return jsonify({"id_message": msg_id}), 201

    finally:
        cur.close()
        conn.close()


@app.patch("/api/chat/messages/<int:message_id>")
def edit_message(message_id):
    data = request.get_json(force=True) or {}
    sender_id = data.get("sender_id")
    new_content = (data.get("content") or "").strip()

    if not sender_id or not new_content:
        return jsonify({"error": "Chýba odosielateľ alebo obsah."}), 400

    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        # skontroluj, že správa existuje a patrí tomuto používateľovi
        cur.execute(
            "SELECT id_message, sender_id FROM messages WHERE id_message = %s",
            (message_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Správa neexistuje."}), 404
        if int(row["sender_id"]) != int(sender_id):
            return jsonify({"error": "Nemôžeš upraviť cudziu správu."}), 403

        cur.execute(
            """
            UPDATE messages
            SET content = %s,
                is_edited = 1,
                edited_at = NOW()
            WHERE id_message = %s
            """,
            (new_content, message_id),
        )
        conn.commit()
        return jsonify({"success": True}), 200
    finally:
        cur.close()
        conn.close()


@app.get("/api/chat/conversations/<int:conv_id>/participants")
def get_conversation_participants(conv_id: int):
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"error": "Chýba user_id."}), 400

    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        # bezpečnosť: len člen konverzácie môže vidieť členov
        cur.execute(
            """
            SELECT 1
            FROM conversation_participants
            WHERE id_conversation = %s AND id_user = %s
            LIMIT 1
            """,
            (conv_id, user_id),
        )
        if not cur.fetchone():
            return jsonify({"error": "Nemáš prístup k tejto konverzácii."}), 403

        cur.execute(
            """
            SELECT u.id_user, u.meno, u.priezvisko
            FROM conversation_participants cp
            JOIN users u ON u.id_user = cp.id_user
            WHERE cp.id_conversation = %s
            ORDER BY u.meno ASC, u.priezvisko ASC
            """,
            (conv_id,),
        )
        rows = cur.fetchall()
        return jsonify(rows), 200
    finally:
        cur.close()
        conn.close()


# ==========================================
# 📝 PRÍSPEVKY
# ==========================================

@app.get("/api/posts")
def get_posts():
    q = request.args.get("q", "").strip()
    sort = request.args.get("sort", "id_desc").lower()
    category_param = request.args.get("category", "").strip()
    type_param = request.args.get("type", "").strip()
    author_id = request.args.get("author_id", "").strip()
    role_filter_raw = request.args.get("role", "").strip()

    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(100, max(1, int(request.args.get("page_size", 50))))
    except (TypeError, ValueError):
        page_size = 50
    offset = (page - 1) * page_size

    sort_sql = {
        "id_desc": "p.id_post DESC",
        "id_asc": "p.id_post ASC",
        "title_asc": "p.title ASC",
        "title_desc": "p.title DESC",
    }.get(sort, "p.id_post DESC")

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        where = ["1=1"]
        params = []

        # multiple category/type values allowed, comma-separated
        category_values = []
        for raw in (category_param, type_param):
            if raw:
                category_values.extend([val.strip() for val in raw.split(",") if val.strip()])
        if category_values:
            category_values = list(dict.fromkeys(category_values))
            placeholders = ", ".join(["%s"] * len(category_values))
            where.append(f"p.category IN ({placeholders})")
            params.extend(category_values)

        allowed_roles = {"user_dobrovolnik", "user_firma", "user_senior"}
        role_aliases = {
            "dobrovolnik": "user_dobrovolnik",
            "firma": "user_firma",
            "senior": "user_senior",
        }
        role_filter = role_aliases.get(role_filter_raw.lower(), role_filter_raw) if role_filter_raw else ""
        if role_filter and role_filter in allowed_roles:
            where.append("u.rola = %s")
            params.append(role_filter)
        if author_id:
            where.append("p.user_id = %s")
            params.append(author_id)

        score_sql = "0"
        score_params = []
        if q:
            like_any = f"%{q}%"
            like_prefix = f"{q}%"
            fullname = "CONCAT(u.meno,' ',u.priezvisko)"
            where.append(
                "(p.title LIKE %s OR p.description LIKE %s OR p.category LIKE %s OR u.rola LIKE %s OR "
                f"{fullname} LIKE %s)"
            )
            params += [like_any, like_any, like_any, like_any, like_any]
            score_sql = f"""
                (CASE WHEN p.title = %s THEN 120 ELSE 0 END) +
                (CASE WHEN p.title LIKE %s THEN 80 ELSE 0 END) +
                (CASE WHEN p.description LIKE %s THEN 40 ELSE 0 END) +
                (CASE WHEN p.category LIKE %s THEN 30 ELSE 0 END) +
                (CASE WHEN u.rola LIKE %s THEN 28 ELSE 0 END) +
                (CASE WHEN {fullname} LIKE %s THEN 25 ELSE 0 END) +
                (CASE WHEN p.title LIKE %s THEN 10 ELSE 0 END) +
                (CASE WHEN p.description LIKE %s THEN 6 ELSE 0 END) +
                (CASE WHEN p.category LIKE %s THEN 5 ELSE 0 END) +
                (CASE WHEN u.rola LIKE %s THEN 4 ELSE 0 END)
            """
            score_params = [
                q,
                like_prefix, like_prefix, like_prefix, like_prefix, like_prefix,
                like_any, like_any, like_any, like_any,
            ]
            sort_sql = "score DESC, p.title ASC, p.id_post DESC"

        where_sql = " AND ".join(where)

        cur.execute(f"""
            SELECT COUNT(*) AS total
            FROM posts p
            JOIN users u ON u.id_user = p.user_id
            WHERE {where_sql}
        """, params)
        total = cur.fetchone()["total"]

        rating_join = """
            LEFT JOIN (
                SELECT user_id, AVG(rating) AS avg_rating
                FROM user_ratings
                GROUP BY user_id
            ) r ON r.user_id = p.user_id
        """

        if q:
            cur.execute(f"""
                SELECT p.id_post, p.title, p.description, p.image, p.category, p.user_id,
                       u.meno AS name, u.priezvisko AS surname,
                       r.avg_rating, u.rola,
                       {score_sql} AS score
                FROM posts p
                JOIN users u ON u.id_user = p.user_id
                {rating_join}
                WHERE {where_sql}
                ORDER BY {sort_sql}
                LIMIT %s OFFSET %s
            """, score_params + params + [page_size, offset])
        else:
            cur.execute(f"""
                SELECT p.id_post, p.title, p.description, p.image, p.category, p.user_id,
                       u.meno AS name, u.priezvisko AS surname, u.rola,
                       r.avg_rating
                FROM posts p
                JOIN users u ON u.id_user = p.user_id
                {rating_join}
                WHERE {where_sql}
                ORDER BY {sort_sql}
                LIMIT %s OFFSET %s
            """, params + [page_size, offset])

        rows = cur.fetchall()
        for item in rows:
            if item.get("image"):
                item["image"] = _make_abs(item["image"])

        if not q and not category_values and not role_filter and not author_id:
            return jsonify(rows), 200

        return jsonify({
            "items": rows,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "pages": (total + page_size - 1) // page_size,
            }
        }), 200
    except Exception as e:
        return jsonify({"error": f"Chyba pri načítaní príspevkov: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()

@app.get("/api/posts/<int:id_post>")
def get_post_detail(id_post: int):
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT p.id_post, p.title, p.description, p.image, p.category, p.user_id,
                   u.meno AS name, u.priezvisko AS surname,
                   r.avg_rating
            FROM posts p
            JOIN users u ON u.id_user = p.user_id
            LEFT JOIN (
                SELECT user_id, AVG(rating) AS avg_rating
                FROM user_ratings
                GROUP BY user_id
            ) r ON r.user_id = p.user_id
            WHERE p.id_post = %s
            """,
            (id_post,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Prispevok neexistuje."}), 404
        if row.get("image"):
            row["image"] = _make_abs(row["image"])
        return jsonify(row), 200
    except Exception as e:
        return jsonify({"error": f"Chyba pri nacitani prispevku: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()

@app.post("/api/posts")
def create_post():
    data = request.get_json(force=True)
    title = data.get("title")
    description = data.get("description")
    category = data.get("category")
    image = data.get("image")
    user_id = data.get("user_id")

    if not all([title, description, category, user_id]):
        return jsonify({"error": "Chýbajú povinné údaje (title, description, category, user_id)."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO posts (title, description, category, image, user_id)
            VALUES (%s, %s, %s, %s, %s)
        """, (title, description, category, None, user_id))
        new_id = cur.lastrowid
        conn.commit()

        if image:
            _save_post_image_from_data_url(conn, new_id, image)

        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT p.id_post, p.title, p.description, p.image, p.category, p.user_id,
                   u.meno AS name, u.priezvisko AS surname
            FROM posts p
            JOIN users u ON u.id_user = p.user_id
            WHERE p.id_post = %s
        """, (new_id,))
        row = cur.fetchone()
        if row and row.get("image"):
            row["image"] = _make_abs(row["image"])
        return jsonify(row), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Chyba pri vytváraní príspevku: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@app.put("/api/posts/<int:id_post>")
def update_post(id_post):
    data = request.get_json(force=True)
    title = data.get("title")
    description = data.get("description")
    category = data.get("category")
    image = data.get("image")

    if not any([title, description, category, image is not None]):
        return jsonify({"error": "Nie je čo aktualizovať."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        sets = []
        params = []
        if title is not None:
            sets.append("title = %s"); params.append(title)
        if description is not None:
            sets.append("description = %s"); params.append(description)
        if category is not None:
            sets.append("category = %s"); params.append(category)
        if image is not None:
            # Ak klient pošle data URL -> uložíme ako súbor + media_files
            if isinstance(image, str) and image.startswith("data:image"):
                stored = _save_post_image_from_data_url(conn, id_post, image)
                if not stored:
                    return jsonify({"error": "Nepodarilo sa uložiť obrázok."}), 400
                sets.append("image = %s"); params.append(stored)
            else:
                # prázdny string => vymazanie obrázka
                if not image:
                    _delete_post_images(conn, id_post)
                    sets.append("image = %s"); params.append(None)
                else:
                    # URL alebo cesta; zároveň čistíme staré záznamy, aby sedel media_files
                    _delete_post_images(conn, id_post)
                    sets.append("image = %s"); params.append(_make_abs(image))

        if not sets:
            return jsonify({"error": "Nie je čo aktualizovať."}), 400

        params.append(id_post)
        cur.execute(f"UPDATE posts SET {', '.join(sets)} WHERE id_post = %s", tuple(params))
        if cur.rowcount == 0:
            # Ak sa nezmenili dáta, overíme, či príspevok existuje; ak áno, považujme za OK.
            cur.execute("SELECT 1 FROM posts WHERE id_post = %s", (id_post,))
            if not cur.fetchone():
                return jsonify({"error": "Príspevok neexistuje."}), 404
        conn.commit()
        return jsonify({"success": True}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Chyba pri aktualizácii príspevku: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@app.delete("/api/posts/<int:id_post>")
def delete_post(id_post):
    conn = get_conn()
    try:
        cur = conn.cursor()
        _delete_post_images(conn, id_post)
        cur.execute("DELETE FROM posts WHERE id_post = %s", (id_post,))
        if cur.rowcount == 0:
            return jsonify({"error": "Príspevok neexistuje."}), 404
        conn.commit()
        return jsonify({"success": True}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Chyba pri mazaní príspevku: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()

# ==========================================
# 👤 PROFIL – GET/UPDATE
# ==========================================

ALLOWED_PROFILE_FIELDS = {"meno", "priezvisko", "datum_narodenia", "mesto", "about"}

def _validate_profile_payload(data: dict):
    """Základná validácia pre update profilu."""
    if not data or not any(k in data for k in ALLOWED_PROFILE_FIELDS):
        return False, "Nie je čo aktualizovať."

    # dĺžky a formáty
    if "meno" in data and (not data["meno"] or len(data["meno"]) > 100):
        return False, "Meno je povinné a môže mať max 100 znakov."
    if "priezvisko" in data and (not data["priezvisko"] or len(data["priezvisko"]) > 100):
        return False, "Priezvisko je povinné a môže mať max 100 znakov."
    if "mesto" in data and (data["mesto"] is not None) and len(data["mesto"]) > 100:
        return False, "Mesto môže mať max 100 znakov."
    if "about" in data and (data["about"] is not None) and len(data["about"]) > 5000:
        return False, "Text „O mne“ môže mať max 5000 znakov."
    if "datum_narodenia" in data and data["datum_narodenia"]:
        try:
            # očakáva sa 'YYYY-MM-DD'
            datetime.strptime(data["datum_narodenia"], "%Y-%m-%d")
        except Exception:
            return False, "Neplatný formát dátumu (použi YYYY-MM-DD)."

    # nepovolené polia (napr. mail, heslo, rola) – ak by prišli, odmietneme
    forbidden = set(data.keys()) - ALLOWED_PROFILE_FIELDS
    if forbidden:
        return False, f"Nasledujúce polia nie je možné meniť: {', '.join(sorted(forbidden))}"

    return True, ""

# Avatar endpoints (media_files + assets/img/avatars)
@app.post("/api/profile/<int:user_id>/avatar")
def upload_profile_avatar(user_id: int):
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "S?bor nebol dodan?."}), 400

    filename = secure_filename(file.filename)
    _, ext = os.path.splitext(filename)
    ext = ext.lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        return jsonify({"error": "Nepodporovan? form?t. Povolen?: jpg, jpeg, png, gif, webp"}), 400

    file_uid = str(uuid.uuid4())
    path = _avatar_disk_path(file_uid, ext)
    try:
        file.save(path)
    except Exception as e:
        return jsonify({"error": f"Ukladanie zlyhalo: {str(e)}"}), 500

    size_bytes = os.path.getsize(path)
    storage_path = f"/assets/img/avatars/{file_uid}{ext}"

    conn = get_conn()
    cur = None
    try:
        _delete_avatar_records(conn, user_id)  # dr??me jeden avatar
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO media_files
              (owner_type, owner_id, purpose, sort_order, file_uid, file_name, file_ext, mime_type, size_bytes, storage_path)
            VALUES
              ('user', %s, 'avatar', 0, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id,
                file_uid,
                filename,
                ext,
                file.mimetype or None,
                size_bytes,
                storage_path,
            ),
        )
        conn.commit()
    except Exception as exc:
        try:
            os.remove(path)
        except Exception:
            pass
        return jsonify({"error": f"Ukladanie zlyhalo: {exc}"}), 500
    finally:
        if cur:
            cur.close()

    return jsonify({"url": storage_path, "uid": file_uid}), 201


@app.get("/api/profile/<int:user_id>/avatar")
def get_profile_avatar_meta(user_id: int):
    conn = get_conn()
    try:
        meta = _find_avatar_meta(conn, user_id)
        if not meta:
            return jsonify({"error": "Avatar nen?jden?"}), 404
        return jsonify({"url": meta["storage_path"], "uid": meta["file_uid"]}), 200
    finally:
        conn.close()


@app.delete("/api/profile/<int:user_id>/avatar")
def delete_profile_avatar(user_id: int):
    conn = get_conn()
    try:
        meta = _find_avatar_meta(conn, user_id)
        if not meta:
            return jsonify({"error": "Avatar nen?jden?"}), 404
        _delete_avatar_records(conn, user_id)
        return jsonify({"status": "ok"}), 200
    except Exception as exc:
        logging.exception("Failed to delete avatar for user %s: %s", user_id, exc)
        return jsonify({"error": "Nepodarilo sa odstr?ni? avatar."}), 500
    finally:
        conn.close()


@app.get("/assets/img/avatars/<path:filename>")
def serve_avatar_file(filename: str):
    return send_from_directory(AVATARS_DIR, filename, as_attachment=False)


# Post image endpoints (media_files + assets/img/posts)
@app.post("/api/posts/<int:post_id>/image")
def upload_post_image(post_id: int):
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Súbor nebol dodaný."}), 400

    raw_main_flag = request.form.get("main") or request.args.get("main") or ""
    is_main = str(raw_main_flag).lower() in {"1", "true", "yes", "on", "main"}

    filename = secure_filename(file.filename)
    _, ext = os.path.splitext(filename)
    ext = ext.lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        return jsonify({"error": "Nepodporovaný formát. Povolené: jpg, jpeg, png, gif, webp"}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM posts WHERE id_post = %s", (post_id,))
        if not cur.fetchone():
            return jsonify({"error": "Príspevok neexistuje."}), 404
    finally:
        cur.close()

    file_uid = str(uuid.uuid4())
    path = _post_image_disk_path(file_uid, ext)
    try:
        file.save(path)
    except Exception as exc:
        return jsonify({"error": f"Ukladanie zlyhalo: {exc}"}), 500

    size_bytes = os.path.getsize(path)
    storage_path = f"/assets/img/posts/{file_uid}{ext}"

    try:
        storage_url, sort_order = _insert_post_image_record(
            conn,
            post_id,
            file_uid=file_uid,
            filename=filename,
            ext=ext,
            mime_type=file.mimetype or None,
            size_bytes=size_bytes,
            storage_path=storage_path,
            is_main=is_main,
        )
    except Exception as exc:
        try:
            os.remove(path)
        except Exception:
            pass
        return jsonify({"error": f"Ukladanie zlyhalo: {exc}"}), 500

    return jsonify({"url": storage_url, "uid": file_uid, "storage_path": storage_path, "sort_order": sort_order, "is_main": is_main}), 201


@app.get("/api/posts/<int:post_id>/image")
def get_post_image_meta(post_id: int):
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT file_uid, file_ext, storage_path
            FROM media_files
            WHERE owner_type = 'post' AND owner_id = %s AND purpose = 'post_image'
            AND sort_order = 0
            LIMIT 1
            """,
            (post_id,),
        )
        row = cur.fetchone()

        if row:
            return jsonify({"url": _make_abs(row["storage_path"]), "uid": row["file_uid"], "storage_path": row["storage_path"]}), 200

        cur.execute("SELECT image FROM posts WHERE id_post = %s", (post_id,))
        fallback = cur.fetchone()
        if fallback and fallback[0]:
            return jsonify({"url": _make_abs(fallback[0]), "uid": None}), 200

        return jsonify({"error": "Obrázok pre príspevok neexistuje."}), 404
    finally:
        cur.close()
        conn.close()


@app.get("/api/posts/<int:post_id>/images")
def list_post_images(post_id: int):
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT file_uid AS uid, file_uid, storage_path, sort_order, file_name, mime_type
            FROM media_files
            WHERE owner_type = 'post' AND owner_id = %s AND purpose = 'post_image'
            ORDER BY sort_order ASC, created_at ASC
            """,
            (post_id,),
        )
        rows = cur.fetchall()
        for row in rows:
            if row.get("storage_path"):
                row["url"] = _make_abs(row["storage_path"])
        return jsonify(rows), 200
    finally:
        cur.close()
        conn.close()


@app.delete("/api/posts/<int:post_id>/images/<string:file_uid>")
def delete_post_image(post_id: int, file_uid: str):
    conn = get_conn()
    try:
        existed = _delete_post_image_by_uid(conn, post_id, file_uid)
        if not existed:
            return jsonify({"error": "Obrázok neexistuje."}), 404

        next_image = _resequence_post_images(conn, post_id)
        return jsonify({"success": True, "next_image": next_image}), 200
    finally:
        conn.close()


@app.get("/assets/img/posts/<path:filename>")
def serve_post_image(filename: str):
    return send_from_directory(POST_IMAGES_DIR, filename, as_attachment=False)


@app.get("/assets/img/activities/<path:filename>")
def serve_activity_image(filename: str):
    return send_from_directory(ACTIVITY_IMAGES_DIR, filename, as_attachment=False)

@app.get("/assets/img/articles/<path:filename>")
def serve_article_image(filename: str):
    return send_from_directory(ARTICLE_IMAGES_DIR, filename, as_attachment=False)


@app.get("/api/profile/<int:user_id>")
def get_profile(user_id: int):
    """Načíta detaily profilu pre daného používateľa (bez hesla)."""
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT 
                u.id_user, u.meno, u.priezvisko, u.mail, u.datum_narodenia,
                u.mesto, u.about, u.rola, u.created_at
            FROM users u
            WHERE u.id_user = %s
        """, (user_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Používateľ neexistuje."}), 404
        return jsonify(row), 200
    finally:
        cur.close()
        conn.close()

@app.put("/api/profile/<int:user_id>")
def update_profile(user_id: int):
    """
    Aktualizuje profil prihláseného používateľa.
    Meniteľné: meno, priezvisko, datum_narodenia, mesto, about
    Nemeníme: mail, heslo, rola, soft_del, atď.
    """
    data = request.get_json(force=True) or {}
    ok, msg = _validate_profile_payload(data)
    if not ok:
        return jsonify({"error": msg}), 400

    sets = []
    params = []
    for field in ALLOWED_PROFILE_FIELDS:
        if field in data:
            sets.append(f"{field} = %s")
            params.append(data[field])

    if not sets:
        return jsonify({"error": "Nie je čo aktualizovať."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        params.append(user_id)
        cur.execute(
            f"UPDATE users SET {', '.join(sets)} WHERE id_user = %s",
            tuple(params),
        )
        if cur.rowcount == 0:
            return jsonify({"error": "Používateľ neexistuje alebo je zmazaný."}), 404
        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Chyba pri ukladaní profilu: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()

    # po úspešnom update vrátime aktualizovaný profil
    return get_profile(user_id)

# ==========================================
# 🧩 PROFIL – HOBBY GET/PUT
# ==========================================

@app.get("/api/profile/<int:user_id>/hobbies")
def get_user_hobbies(user_id: int):
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT h.id_hobby, h.nazov, h.id_kategoria, hk.nazov AS kategoria_nazov
            FROM user_hobby uh
            JOIN hobby h ON h.id_hobby = uh.id_hobby
            LEFT JOIN hobby_kategoria hk ON hk.id_kategoria = h.id_kategoria
            WHERE uh.id_user = %s
            ORDER BY hk.nazov ASC, h.nazov ASC
            """,
            (user_id,),
        )
        items = cur.fetchall()
        return jsonify(items), 200
    except Exception as e:
        return jsonify({"error": f"Chyba pri načítaní záľub: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@app.put("/api/profile/<int:user_id>/hobbies")
def put_user_hobbies(user_id: int):
    data = request.get_json(force=True) or {}
    hobbies = data.get("hobbies")
    if not isinstance(hobbies, list):
        return jsonify({"error": "Pole 'hobbies' musí byť zoznam ID."}), 400

    try:
        hobby_ids = sorted({int(hid) for hid in hobbies})
    except Exception:
        return jsonify({"error": "Neplatné ID v hobbies."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        if hobby_ids:
            cur.execute(
                f"SELECT COUNT(*) FROM hobby WHERE id_hobby IN ({','.join(['%s']*len(hobby_ids))})",
                tuple(hobby_ids),
            )
            count = cur.fetchone()[0]
            if count != len(hobby_ids):
                return jsonify({"error": "Niektoré hobby ID neexistujú."}), 400

        cur.execute("DELETE FROM user_hobby WHERE id_user = %s", (user_id,))
        if hobby_ids:
            cur.executemany(
                "INSERT INTO user_hobby (id_user, id_hobby) VALUES (%s, %s)",
                [(user_id, hid) for hid in hobby_ids],
            )
        conn.commit()
        try:
            generate_and_save_user_embedding(user_id)
        except Exception as emb_err:
            logging.warning(
                "Failed to refresh user embedding for %s: %s",
                user_id,
                emb_err,
            )
        return jsonify({"success": True, "count": len(hobby_ids)}), 200
    
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Chyba pri ukladaní záľub: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()

@app.get("/api/match/<int:user_id>")
def api_match_user(user_id: int):
    try:
        top_n = int(request.args.get("top_n", 5))
    except Exception:
        top_n = 5

    target_role = request.args.get("role") or None
    # Read optional distance in kilometers from the request (keeps old behavior if missing).
    distance_param = request.args.get("distance_km")
    distance_km = None
    if distance_param is not None and str(distance_param).strip():
        try:
            parsed = float(distance_param)
            if parsed > 0:
                distance_km = parsed
        except (TypeError, ValueError):
            return jsonify({"error": "Parameter distance_km must be a positive number."}), 400

    try:
        matches = find_best_matches_for_user(
            user_id,
            top_n=max(1, top_n),
            target_role=target_role,
            distance_km=distance_km,
        )
    except Exception as exc:
        logging.exception("Failed to match user %s: %s", user_id, exc)
        return jsonify({"error": str(exc)}), 500

    return jsonify(matches), 200

    
# ==========================================
# MATCH ENDPOINT
# ==========================================


# ------------------------------------------
# ACTIVITIES
# ------------------------------------------

@app.get("/api/activities")
def list_activities():
    page_size = int(request.args.get("page_size", 20))
    page = int(request.args.get("page", 1))
    q = request.args.get("q", "").strip()
    offset = (page - 1) * page_size

    sql = """
      SELECT id_activity, title, description, image_url, capacity, attendees_count, lat, lng, user_id, created_at
      FROM activities
    """
    params = []
    if q:
        sql += " WHERE title LIKE %s OR description LIKE %s"
        like = f"%{q}%"
        params.extend([like, like])
    sql_count = "SELECT COUNT(*) AS total FROM (" + sql + ") t"
    sql += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
    params.extend([page_size, offset])

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql_count, params[:-2] if q else [])
        total = cur.fetchone()["total"]
        cur.execute(sql, params)
        items = cur.fetchall()
        for item in items:
            if item.get("image_url"):
                item["image_url"] = _make_abs(item["image_url"])
        return jsonify({"items": items, "pagination": {
            "page": page, "page_size": page_size,
            "total": total, "pages": (total + page_size - 1)//page_size
        }})
    finally:
        conn.close()


import requests
import logging
GEOCODE_URL = "https://nominatim.openstreetmap.org/search"

import requests
import logging

GEOCODE_URL = "https://nominatim.openstreetmap.org/search"

def geocode_address(address: str):
    params = {
        "q": address,
        "format": "json",
        "limit": 1,
        "addressdetails": 1,
    }
    headers = {
        "User-Agent": "LifeBridgeApp/1.0 (contact@lifebridge.sk)"
    }

    try:
        resp = requests.get(GEOCODE_URL, params=params, headers=headers, timeout=10)
    except requests.RequestException as e:
        logging.exception(f"Geocode request failed: {e}")
        raise ValueError("Nepodarilo sa kontaktovať geokódovaciu službu.")

    if resp.status_code != 200:
        logging.warning(f"Nominatim HTTP {resp.status_code}: {resp.text[:200]}")
        raise ValueError("Geokódovanie zlyhalo (chyba služby).")

    try:
        data = resp.json()
    except ValueError:
        logging.warning(f"Nominatim vrátil neplatný JSON: {resp.text[:200]}")
        raise ValueError("Geokódovanie vrátilo neplatnú odpoveď.")

    if not isinstance(data, list) or len(data) == 0:
        logging.info(f"Nominatim nenašiel výsledky pre adresu: {address}")
        raise ValueError("Pre zadanú adresu sa nenašli žiadne súradnice.")

    first = data[0]
    logging.info(f"Nominatim response for '{address}': {first}")  # DEBUG log
    
    lat_str = first.get("lat")
    lon_str = first.get("lon")
    
    if not lat_str or not lon_str:
        logging.warning(f"Missing lat/lon in response: {first}")
        raise ValueError("Geokódovanie vrátilo neúplné súradnice.")
    
    try:
        lat = float(lat_str)
        lng = float(lon_str)
    except (ValueError, TypeError) as e:
        logging.warning(f"Chyba pri parsovaní súradníc lat={lat_str}, lon={lon_str}: {e}")
        raise ValueError("Geokódovanie vrátilo neplatné súradnice.")
    
    # Extra validácia rozsahu
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        logging.warning(f"Súradnice mimo rozsahu: lat={lat}, lon={lng}")
        raise ValueError("Geokódovanie vrátilo súradnice mimo platného rozsahu.")

    return lat, lng


@app.post("/api/activities")
def create_activity():
    data = request.get_json()
    title = data.get("title")
    description = data.get("description")
    image = data.get("image") or data.get("image_url")
    capacity = data.get("capacity")
    user_id = data.get("user_id")
    address = data.get("address")  # nový vstup z frontendu

    if not title or len(title.strip()) == 0:
        return jsonify({"error": "Názov je povinný."}), 400
    if not isinstance(capacity, int) or capacity < 1:
        return jsonify({"error": "Neplatná kapacita."}), 400
    if not user_id:
        return jsonify({"error": "Nepodarilo sa identifikovať používateľa."}), 400
    if not address or len(address.strip()) == 0:
        return jsonify({"error": "Adresa je povinná."}), 400

    try:
        lat, lng = geocode_address(address)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        return jsonify({"error": "Nepodarilo sa získať súradnice z adresy."}), 502

    # validácia výsledných súradníc (pre istotu)
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return jsonify({"error": "Geokódovanie vrátilo neplatné súradnice."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO activities (title, description, image_url, capacity, lat, lng, user_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (title, description, None, capacity, lat, lng, user_id))
        activity_id = cur.lastrowid
        conn.commit()

        if image:
            if isinstance(image, str) and image.startswith("data:image"):
                stored = _save_activity_image_from_data_url(conn, activity_id, image)
                if stored:
                    image = stored
            else:
                image = _make_abs(str(image))
                cur.execute(
                    "UPDATE activities SET image_url = %s WHERE id_activity = %s",
                    (image, activity_id),
                )
                conn.commit()

        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM activities WHERE id_activity = %s", (activity_id,))
        row = cur.fetchone()
        if row and row.get("image_url"):
            row["image_url"] = _make_abs(row["image_url"])
        return jsonify(row), 201
    finally:
        conn.close()


@app.get("/api/activities/<int:activity_id>")
def get_activity(activity_id: int):
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT id_activity, title, description, image_url, capacity, attendees_count, lat, lng, user_id, created_at
            FROM activities
            WHERE id_activity = %s
            """,
            (activity_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Aktivita neexistuje."}), 404
        if row.get("image_url"):
            row["image_url"] = _make_abs(row["image_url"])
        return jsonify(row), 200
    finally:
        cur.close()
        conn.close()


@app.post("/api/activities/<int:activity_id>/image")
def upload_activity_image(activity_id: int):
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Súbor nebol dodaný."}), 400

    filename = secure_filename(file.filename)
    _, ext = os.path.splitext(filename)
    ext = ext.lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        return jsonify({"error": "Nepodporovaný formát. Povolené: jpg, jpeg, png, gif, webp"}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM activities WHERE id_activity = %s", (activity_id,))
        if not cur.fetchone():
            return jsonify({"error": "Aktivita neexistuje."}), 404
    finally:
        cur.close()

    file_uid = str(uuid.uuid4())
    path = _activity_image_disk_path(file_uid, ext)
    try:
        file.save(path)
    except Exception as exc:
        return jsonify({"error": f"Ukladanie zlyhalo: {exc}"}), 500

    size_bytes = os.path.getsize(path)
    storage_path = f"/assets/img/activities/{file_uid}{ext}"
    storage_url = _make_abs(storage_path)

    cur = None
    try:
        _delete_activity_image(conn, activity_id)
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO media_files
              (owner_type, owner_id, purpose, sort_order, file_uid, file_name, file_ext, mime_type, size_bytes, storage_path)
            VALUES
              ('activity', %s, 'activity_image', 0, %s, %s, %s, %s, %s, %s)
            """,
            (
                activity_id,
                file_uid,
                filename,
                ext,
                file.mimetype or None,
                size_bytes,
                storage_path,
            ),
        )
        cur.execute(
            "UPDATE activities SET image_url = %s WHERE id_activity = %s",
            (storage_url, activity_id),
        )
        conn.commit()
    except Exception as exc:
        try:
            os.remove(path)
        except Exception:
            pass
        return jsonify({"error": f"Ukladanie zlyhalo: {exc}"}), 500
    finally:
        if cur:
            cur.close()

    return jsonify({"url": storage_url, "uid": file_uid, "storage_path": storage_path}), 201


@app.get("/api/activities/<int:activity_id>/image")
def get_activity_image_meta(activity_id: int):
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT file_uid, storage_path
            FROM media_files
            WHERE owner_type = 'activity' AND owner_id = %s AND purpose = 'activity_image'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (activity_id,),
        )
        row = cur.fetchone()
        if row:
            return jsonify(
                {
                    "url": _make_abs(row["storage_path"]),
                    "storage_path": row["storage_path"],
                    "uid": row["file_uid"],
                }
            ), 200

        cur.execute("SELECT image_url FROM activities WHERE id_activity = %s", (activity_id,))
        fallback = cur.fetchone()
        if fallback and fallback[0]:
            return jsonify({"url": _make_abs(fallback[0]), "uid": None}), 200

        return jsonify({"error": "Obrázok pre aktivitu neexistuje."}), 404
    finally:
        cur.close()
        conn.close()


@app.delete("/api/activities/<int:activity_id>/image")
def delete_activity_image(activity_id: int):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM activities WHERE id_activity = %s", (activity_id,))
        exists = cur.fetchone()
        cur.close()
        if not exists:
            return jsonify({"error": "Aktivita neexistuje."}), 404

        _delete_activity_image(conn, activity_id)
        return jsonify({"success": True}), 200
    except Exception as exc:
        logging.warning("Failed to delete activity image: %s", exc)
        return jsonify({"error": "Nepodarilo sa odstrániť obrázok."}), 500
    finally:
        conn.close()


@app.put("/api/activities/<int:activity_id>")
def update_activity(activity_id: int):
    data = request.get_json(force=True) or {}
    title = data.get("title")
    description = data.get("description")
    capacity = data.get("capacity")
    image = data.get("image") or data.get("image_url")
    user_id = data.get("user_id")
    remove_image = bool(data.get("remove_image"))

    if not user_id:
        return jsonify({"error": "Chýba user_id."}), 400

    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT user_id FROM activities WHERE id_activity = %s", (activity_id,))
        owner_row = cur.fetchone()
        if not owner_row:
            return jsonify({"error": "Aktivita neexistuje."}), 404
        if int(owner_row["user_id"]) != int(user_id):
            return jsonify({"error": "Nemáš oprávnenie upraviť túto aktivitu."}), 403

        sets = []
        params: list = []

        if title is not None:
            if not str(title).strip():
                return jsonify({"error": "Názov je povinný."}), 400
            sets.append("title = %s"); params.append(title)

        if description is not None:
            sets.append("description = %s"); params.append(description)

        if capacity is not None:
            try:
                capacity_int = int(capacity)
            except Exception:
                return jsonify({"error": "Kapacita musí byť číslo."}), 400
            if capacity_int < 1:
                return jsonify({"error": "Kapacita musí byť aspoň 1."}), 400
            sets.append("capacity = %s"); params.append(capacity_int)

        if image is not None or remove_image:
            # Handle image update/removal
            if isinstance(image, str) and image.startswith("data:image"):
                stored = _save_activity_image_from_data_url(conn, activity_id, image)
                if not stored:
                    return jsonify({"error": "Nepodarilo sa uložiť obrázok."}), 400
                sets.append("image_url = %s"); params.append(stored)
            elif remove_image or (isinstance(image, str) and not image):
                _delete_activity_image(conn, activity_id)
                sets.append("image_url = %s"); params.append(None)
            elif image:
                _delete_activity_image(conn, activity_id)
                abs_url = _make_abs(str(image))
                sets.append("image_url = %s"); params.append(abs_url)

        if not sets:
            return jsonify({"error": "Nie je čo aktualizovať."}), 400

        params.append(activity_id)
        cur.execute(f"UPDATE activities SET {', '.join(sets)} WHERE id_activity = %s", tuple(params))
        conn.commit()

        cur.execute("SELECT * FROM activities WHERE id_activity = %s", (activity_id,))
        row = cur.fetchone()
        if row and row.get("image_url"):
            row["image_url"] = _make_abs(row["image_url"])
        return jsonify(row), 200
    finally:
        cur.close()
        conn.close()


@app.post("/api/activities/<int:activity_id>/signup")
def signup_activity(activity_id):
    data = request.get_json()
    user_id = data.get("user_id")

    if not user_id:
        return jsonify({"error": "Nepodarilo sa identifikovat pouzivatela."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT capacity, attendees_count FROM activities WHERE id_activity = %s FOR UPDATE", (activity_id,))
        row = cur.fetchone()
        if row is None:
            return jsonify({"error": "Aktivita neexistuje."}), 404
        capacity, attendees_count = row
        if attendees_count >= capacity:
            return jsonify({"error": "Kapacita je naplnena."}), 400

        cur.execute("SELECT 1 FROM activity_signups WHERE activity_id = %s AND user_id = %s", (activity_id, user_id))
        if cur.fetchone() is not None:
            return jsonify({"error": "Uz ste prihlaseny na tuto aktivitu."}), 400

        # Vytvor prihlasenie + zvys pocet ucastnikov
        cur.execute("INSERT INTO activity_signups (activity_id, user_id) VALUES (%s, %s)", (activity_id, user_id))
        cur.execute("UPDATE activities SET attendees_count = attendees_count + 1 WHERE id_activity = %s", (activity_id,))
        conn.commit()

        cur.execute("SELECT attendees_count FROM activities WHERE id_activity = %s", (activity_id,))
        attendees_count = cur.fetchone()[0]
        return jsonify({"attendees_count": attendees_count})
    finally:
        conn.close()

@app.delete("/api/activities/<int:activity_id>/signup")
def cancel_signup(activity_id):
    data = request.get_json()
    user_id = data.get("user_id")

    if not user_id:
        return jsonify({"error": "Nepodarilo sa identifikovat pouzivatela."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM activity_signups WHERE activity_id = %s AND user_id = %s", (activity_id, user_id))
        cur.execute("UPDATE activities SET attendees_count = GREATEST(attendees_count - 1, 0) WHERE id_activity = %s", (activity_id,))
        conn.commit()
        cur.execute("SELECT attendees_count FROM activities WHERE id_activity = %s", (activity_id,))
        attendees_count = cur.fetchone()[0]
        return jsonify({"message": "uspesne odhlaseny", "attendees_count": attendees_count})
    finally:
        conn.close()

@app.get("/api/activities/<int:activity_id>/signups")
def list_activity_signups(activity_id: int):
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT u.id_user, u.meno, u.priezvisko, u.rola, s.created_at
            FROM activity_signups s
            JOIN users u ON u.id_user = s.user_id
            WHERE s.activity_id = %s
            ORDER BY s.created_at ASC
            """,
            (activity_id,),
        )
        rows = cur.fetchall()
        return jsonify(rows), 200
    finally:
        conn.close()

# ==========================================
# ARTICLES
# ==========================================     

@app.get("/api/articles")
def list_articles():
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM articles ORDER BY created_at DESC")
        rows = cur.fetchall()
        for row in rows:
            if row.get("image_url"):
                row["image_url"] = _make_abs(row["image_url"])
        return jsonify(rows)
    finally:
        conn.close()

@app.get("/api/articles/<int:id_article>")
def get_article(id_article):
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM articles WHERE id_article = %s", (id_article,))
        article = cur.fetchone()
        if not article:
            return jsonify({"error": "Article not found"}), 404
        if article.get("image_url"):
            article["image_url"] = _make_abs(article["image_url"])
        return jsonify(article)
    finally:
        conn.close()

@app.post("/api/articles")
def create_article():
    data = request.get_json()
    title = data.get("title")
    text = data.get("text")
    image = data.get("image") or data.get("image_url")

    if not title or not text:
        return jsonify({"error": "Title and text are required"}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO articles (title, text, image_url)
            VALUES (%s, %s, %s)
        """, (title, text, None))
        conn.commit()

        new_id = cur.lastrowid
        if image:
            if isinstance(image, str) and image.startswith("data:image"):
                stored = _save_article_image_from_data_url(conn, new_id, image)
                if stored:
                    image = stored
            else:
                image = _make_abs(str(image))
                cur.execute("UPDATE articles SET image_url = %s WHERE id_article = %s", (image, new_id))
                conn.commit()

        return jsonify({"id_article": new_id, "image_url": _make_abs(image) if image else None}), 201
    finally:
        conn.close()

@app.post("/api/articles/<int:article_id>/image")
def upload_article_image(article_id: int):
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Subor nebol dodany."}), 400

    filename = secure_filename(file.filename)
    _, ext = os.path.splitext(filename)
    ext = ext.lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        return jsonify({"error": "Nepodporovany format. Povolené: jpg, jpeg, png, gif, webp"}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM articles WHERE id_article = %s", (article_id,))
        if not cur.fetchone():
            return jsonify({"error": "Article not found"}), 404
    finally:
        cur.close()

    file_uid = str(uuid.uuid4())
    path = _article_image_disk_path(file_uid, ext)
    try:
        file.save(path)
    except Exception as exc:
        return jsonify({"error": f"Ukladanie zlyhalo: {exc}"}), 500

    size_bytes = os.path.getsize(path)
    storage_path = f"/assets/img/articles/{file_uid}{ext}"
    storage_url = _make_abs(storage_path)

    cur = None
    try:
        cur = conn.cursor()
        _delete_article_image(conn, article_id)
        cur.execute(
            """
            INSERT INTO media_files
              (owner_type, owner_id, purpose, sort_order, file_uid, file_name, file_ext, mime_type, size_bytes, storage_path)
            VALUES
              ('article', %s, 'attachment', 0, %s, %s, %s, %s, %s, %s)
            """,
            (
                article_id,
                file_uid,
                filename,
                ext,
                file.mimetype or None,
                size_bytes,
                storage_path,
            ),
        )
        cur.execute("UPDATE articles SET image_url = %s WHERE id_article = %s", (storage_url, article_id))
        conn.commit()
    except Exception as exc:
        try:
            os.remove(path)
        except Exception:
            pass
        return jsonify({"error": f"Ukladanie zlyhalo: {exc}"}), 500
    finally:
        if cur:
            cur.close()

    return jsonify({"url": storage_url, "uid": file_uid, "storage_path": storage_path}), 201


# ==========================================
# 🚀 MAIN
# ==========================================
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

