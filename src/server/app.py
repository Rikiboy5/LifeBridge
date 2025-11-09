# server/app.py
from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS
from flask_bcrypt import Bcrypt
import mysql.connector.pooling
import os
import re
from datetime import datetime
from werkzeug.utils import secure_filename
from contextlib import contextmanager
import logging

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
bcrypt = Bcrypt(app)

# 🔧 DB konfigurácia
DB_HOST = os.getenv("DB_HOST", "sql7.freesqldatabase.com")
DB_USER = os.getenv("DB_USER", "sql7806067")
DB_PASS = os.getenv("DB_PASS", "Y8yg3HRkEb")
DB_NAME = os.getenv("DB_NAME", "sql7806067")
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
    if conn is None or not conn.is_connected():
        conn = pool.get_connection()
        setattr(g, "_db_conn", conn)
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

# Filesystem storage for avatars (no DB)
BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
AVATARS_DIR = os.path.join(UPLOAD_DIR, "avatars")
os.makedirs(AVATARS_DIR, exist_ok=True)
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

def _avatar_path_for(user_id: int, ext: str):
    return os.path.join(AVATARS_DIR, f"user_{user_id}{ext}")

def _find_existing_avatar(user_id: int):
    for ext in ALLOWED_IMAGE_EXTS:
        path = _avatar_path_for(user_id, ext)
        if os.path.exists(path):
            return path, ext
    return None, None

# 🔒 Validácia hesla
def validate_password(password):
    """
    Kontroluje bezpečnosť hesla:
    - Min 8 znakov
    - Aspoň 1 veľké písmeno
    - Aspoň 1 malé písmeno
    - Aspoň 1 číslo
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
                "birthdate": user["datum_narodenia"]
            }
        }), 200
    finally:
        cur.close()
        conn.close()


# ==========================================
# 👥 POUŽÍVATELIA (test)
# ==========================================
@app.get("/api/users")
def get_users():
    q = request.args.get("q", "").strip()
    sort = request.args.get("sort", "id_desc").lower()  # id_desc | id_asc | name_asc | name_desc | relevance

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

    # default sort (keď nie je q)
    sort_sql = {
        "id_desc": "u.id_user DESC",
        "id_asc": "u.id_user ASC",
        "name_asc": "u.meno ASC, u.priezvisko ASC",
        "name_desc": "u.meno DESC, u.priezvisko DESC",
    }.get(sort, "u.id_user DESC")

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)

        where = ["u.soft_del = 0"]
        params = []

        score_sql = "0"  # default (bez q)

        if q:
            # preferuj case/diakritiku-NEcitlivé kolácie v DB, napr. utf8mb4_0900_ai_ci
            like_any = f"%{q}%"
            like_prefix = f"{q}%"
            like_fullname_prefix = f"{q}%"

            where.append("(u.meno LIKE %s OR u.priezvisko LIKE %s OR u.mail LIKE %s OR CONCAT(u.meno,' ',u.priezvisko) LIKE %s)")
            params += [like_any, like_any, like_any, like_any]

            # jednoduché bodovanie relevancie
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
            # parametre pre score: exact, fullname prefix, prefixy a "contains"
            score_params = [
                q,
                like_fullname_prefix,
                like_prefix, like_prefix, like_prefix,  # prefer prefix na mene/priezvisku/maily
                like_any, like_any, like_any           # a potom ľubovoľné umiestnenie
            ]

            # ak je q, defaultne triedime podľa relevancie (alebo keď si vyžiadaš ?sort=relevance)
            if sort in ("relevance", "id_desc", "id_asc", "name_asc", "name_desc"):
                sort_sql = f"score DESC, u.meno ASC, u.priezvisko ASC"

        where_sql = " AND ".join(where)

        # total
        cur.execute(f"SELECT COUNT(*) AS total FROM users u WHERE {where_sql}", params)
        total = cur.fetchone()["total"]

        # data
        if q:
            cur.execute(
                f"""
                SELECT u.id_user, u.meno, u.priezvisko, u.mail,
                       {score_sql} AS score
                FROM users u
                WHERE {where_sql}
                ORDER BY {sort_sql}
                LIMIT %s OFFSET %s
                """,
                params + score_params + [page_size, offset],
            )
        else:
            cur.execute(
                f"""
                SELECT u.id_user, u.meno, u.priezvisko, u.mail
                FROM users u
                WHERE {where_sql}
                ORDER BY {sort_sql}
                LIMIT %s OFFSET %s
                """,
                params + [page_size, offset],
            )

        rows = cur.fetchall()

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
# 📝 PRÍSPEVKY
# ==========================================

@app.get("/api/posts")
def get_posts():
    q = request.args.get("q", "").strip()
    sort = request.args.get("sort", "id_desc").lower()  # id_desc | id_asc | title_asc | title_desc | relevance
    category = request.args.get("category", "").strip()
    author_id = request.args.get("author_id", "").strip()

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

    sort_sql = {
        "id_desc": "p.id_post DESC",
        "id_asc":  "p.id_post ASC",
        "title_asc": "p.title ASC",
        "title_desc": "p.title DESC",
    }.get(sort, "p.id_post DESC")

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        where = ["1=1"]
        params = []

        if category:
            where.append("p.category = %s")
            params.append(category)
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
                "(p.title LIKE %s OR p.description LIKE %s OR p.category LIKE %s OR "
                f"{fullname} LIKE %s)"
            )
            params += [like_any, like_any, like_any, like_any]
            score_sql = f"""
                (CASE WHEN p.title = %s THEN 120 ELSE 0 END) +
                (CASE WHEN p.title LIKE %s THEN 80 ELSE 0 END) +
                (CASE WHEN p.description LIKE %s THEN 40 ELSE 0 END) +
                (CASE WHEN p.category LIKE %s THEN 30 ELSE 0 END) +
                (CASE WHEN {fullname} LIKE %s THEN 25 ELSE 0 END) +
                (CASE WHEN p.title LIKE %s THEN 10 ELSE 0 END) +
                (CASE WHEN p.description LIKE %s THEN 6 ELSE 0 END)
            """
            score_params = [q, like_prefix, like_prefix, like_prefix, like_prefix, like_any, like_any]
            sort_sql = "score DESC, p.title ASC, p.id_post DESC"

        where_sql = " AND ".join(where)

        # total
        cur.execute(f"""
            SELECT COUNT(*) AS total
            FROM posts p
            JOIN users u ON u.id_user = p.user_id
            WHERE {where_sql}
        """, params)
        total = cur.fetchone()["total"]

        # data
        if q:
            cur.execute(f"""
                SELECT p.id_post, p.title, p.description, p.image, p.category,
                       u.meno AS name, u.priezvisko AS surname,
                       {score_sql} AS score
                FROM posts p
                JOIN users u ON u.id_user = p.user_id
                WHERE {where_sql}
                ORDER BY {sort_sql}
                LIMIT %s OFFSET %s
            """, params + score_params + [page_size, offset])
        else:
            cur.execute(f"""
                SELECT p.id_post, p.title, p.description, p.image, p.category,
                       u.meno AS name, u.priezvisko AS surname
                FROM posts p
                JOIN users u ON u.id_user = p.user_id
                WHERE {where_sql}
                ORDER BY {sort_sql}
                LIMIT %s OFFSET %s
            """, params + [page_size, offset])

        rows = cur.fetchall()

        if not q and not category and not author_id:
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


@app.post("/api/posts")
def create_post():
    data = request.get_json(force=True)
    title = data.get("title")
    description = data.get("description")
    category = data.get("category")
    image = data.get("image")  # môže byť None/base64/url
    user_id = data.get("user_id")

    if not all([title, description, category, user_id]):
        return jsonify({"error": "Chýbajú povinné údaje (title, description, category, user_id)."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO posts (title, description, category, image, user_id)
            VALUES (%s, %s, %s, %s, %s)
        """, (title, description, category, image, user_id))
        new_id = cur.lastrowid
        conn.commit()

        # vráť čerstvo vytvorený záznam (tak ako ho očakáva frontend)
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT p.id_post, p.title, p.description, p.image, p.category,
                   u.meno AS name, u.priezvisko AS surname
            FROM posts p
            JOIN users u ON u.id_user = p.user_id
            WHERE p.id_post = %s
        """, (new_id,))
        row = cur.fetchone()
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
        # poskladaj SET dynamicky, aby sme nemenili polia na None ak neprišli
        sets = []
        params = []
        if title is not None:
            sets.append("title = %s"); params.append(title)
        if description is not None:
            sets.append("description = %s"); params.append(description)
        if category is not None:
            sets.append("category = %s"); params.append(category)
        if image is not None:
            sets.append("image = %s"); params.append(image)

        if not sets:
            return jsonify({"error": "Nie je čo aktualizovať."}), 400

        params.append(id_post)
        cur.execute(f"UPDATE posts SET {', '.join(sets)} WHERE id_post = %s", tuple(params))
        if cur.rowcount == 0:
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

# Avatar (no DB) endpoints
@app.post("/api/profile/<int:user_id>/avatar")
def upload_profile_avatar(user_id: int):
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Súbor nebol dodaný."}), 400

    filename = secure_filename(file.filename)
    _, ext = os.path.splitext(filename)
    ext = ext.lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        return jsonify({"error": "Nepodporovaný formát. Povolené: jpg, jpeg, png, gif, webp"}), 400

    # remove old avatar with different ext
    for e in ALLOWED_IMAGE_EXTS:
        old = _avatar_path_for(user_id, e)
        try:
            if os.path.exists(old):
                os.remove(old)
        except Exception:
            pass

    path = _avatar_path_for(user_id, ext)
    try:
        file.save(path)
    except Exception as e:
        return jsonify({"error": f"Ukladanie zlyhalo: {str(e)}"}), 500

    url = f"/uploads/avatars/user_{user_id}{ext}"
    return jsonify({"url": url}), 201


@app.get("/api/profile/<int:user_id>/avatar")
def get_profile_avatar_meta(user_id: int):
    path, ext = _find_existing_avatar(user_id)
    if not path:
        return jsonify({"error": "Avatar nenájdený"}), 404
    url = f"/uploads/avatars/user_{user_id}{ext}"
    return jsonify({"url": url}), 200


@app.get("/uploads/avatars/<path:filename>")
def serve_avatar_file(filename: str):
    return send_from_directory(AVATARS_DIR, filename, as_attachment=False)
    

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
            WHERE u.id_user = %s AND u.soft_del = 0
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

    # dynamický SET len pre povolené polia
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
        cur.execute(f"""
            UPDATE users
            SET {', '.join(sets)}
            WHERE id_user = %s AND soft_del = 0
        """, tuple(params))
        if cur.rowcount == 0:
            return jsonify({"error": "Používateľ neexistuje alebo je zmazaný."}), 404
        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Chyba pri ukladaní profilu: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()

    # vráť čerstvo aktualizovaný profil
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

    # odfiltruj duplicitné a non-int
    try:
        hobby_ids = sorted({int(hid) for hid in hobbies})
    except Exception:
        return jsonify({"error": "Neplatné ID v hobbies."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        # voliteľne over, že hobby existujú
        if hobby_ids:
            cur.execute(
                f"SELECT COUNT(*) FROM hobby WHERE id_hobby IN ({','.join(['%s']*len(hobby_ids))})",
                tuple(hobby_ids),
            )
            count = cur.fetchone()[0]
            if count != len(hobby_ids):
                return jsonify({"error": "Niektoré hobby ID neexistujú."}), 400

        # vymaž staré väzby a vlož nové (idempotentný replace)
        cur.execute("DELETE FROM user_hobby WHERE id_user = %s", (user_id,))
        if hobby_ids:
            cur.executemany(
                "INSERT INTO user_hobby (id_user, id_hobby) VALUES (%s, %s)",
                [(user_id, hid) for hid in hobby_ids],
            )
        conn.commit()
        return jsonify({"success": True, "count": len(hobby_ids)}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Chyba pri ukladaní záľub: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()

# ------------------------------------------
# Nové endpointy pre activities
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
        return jsonify({"items": items, "pagination": {
            "page": page, "page_size": page_size,
            "total": total, "pages": (total + page_size - 1)//page_size
        }})
    finally:
        conn.close()


@app.post("/api/activities")
def create_activity():
    data = request.get_json()
    title = data.get("title")
    description = data.get("description")
    image_url = data.get("image_url")
    capacity = data.get("capacity")
    lat = data.get("lat")
    lng = data.get("lng")
    user_id = data.get("user_id")

    if not title or len(title.strip()) == 0:
        return jsonify({"error": "Názov je povinný."}), 400
    if not isinstance(capacity, int) or capacity < 1:
        return jsonify({"error": "Neplatná kapacita."}), 400
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return jsonify({"error": "Neplatné súradnice."}), 400
    if not user_id:
        return jsonify({"error": "Nepodarilo sa identifikovať používateľa."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO activities (title, description, image_url, capacity, lat, lng, user_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (title, description, image_url, capacity, lat, lng, user_id))
        activity_id = cur.lastrowid
        conn.commit()
        cur.execute("SELECT * FROM activities WHERE id_activity = %s", (activity_id,))
        row = cur.fetchone()
        keys = [desc[0] for desc in cur.description]
        activity = dict(zip(keys, row))
        return jsonify(activity)
    finally:
        conn.close()


@app.post("/api/activities/<int:activity_id>/signup")
def signup_activity(activity_id):
    data = request.get_json()
    user_id = data.get("user_id")

    if not user_id:
        return jsonify({"error": "Nepodarilo sa identifikovať používateľa."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        # Over kapacitu
        cur.execute("SELECT capacity, attendees_count FROM activities WHERE id_activity = %s FOR UPDATE", (activity_id,))
        row = cur.fetchone()
        if row is None:
            return jsonify({"error": "Aktivita neexistuje."}), 404
        capacity, attendees_count = row
        if attendees_count >= capacity:
            return jsonify({"error": "Kapacita je naplnená."}), 400

        # Skontroluj existujúce prihlásenie
        cur.execute("SELECT 1 FROM activity_signups WHERE activity_id = %s AND user_id = %s", (activity_id, user_id))
        if cur.fetchone() is not None:
            return jsonify({"error": "Už ste prihlásený na túto aktivitu."}), 400

        # Vytvor prihlásenie + zvýš počet účastníkov
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
        return jsonify({"error": "Nepodarilo sa identifikovať používateľa."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM activity_signups WHERE activity_id = %s AND user_id = %s", (activity_id, user_id))
        cur.execute("UPDATE activities SET attendees_count = GREATEST(attendees_count - 1, 0) WHERE id_activity = %s", (activity_id,))
        conn.commit()
        return jsonify({"message": "Úspešne odhlásený"})
    finally:
        conn.close()


# ==========================================
# 🚀 MAIN
# ==========================================
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
