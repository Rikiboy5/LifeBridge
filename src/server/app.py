# server/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_bcrypt import Bcrypt
import mysql.connector.pooling
import os
import re
from datetime import datetime

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
bcrypt = Bcrypt(app)

# 🔧 DB konfigurácia
DB_HOST = os.getenv("DB_HOST", "sql7.freesqldatabase.com")
DB_USER = os.getenv("DB_USER", "sql7804820")
DB_PASS = os.getenv("DB_PASS", "mZhcUrwhAS")
DB_NAME = os.getenv("DB_NAME", "sql7804820")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

# 🧩 Connection pool
pool = mysql.connector.pooling.MySQLConnectionPool(
    pool_name="lifebridge_pool",
    pool_size=5,
    host=DB_HOST,
    user=DB_USER,
    password=DB_PASS,
    database=DB_NAME,
    port=DB_PORT,
    autocommit=True,
    charset="utf8mb4"
)

def get_conn():
    return pool.get_connection()

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
        cur.execute("SELECT id_user, meno, priezvisko, mail, datum_narodenia, rola FROM users WHERE soft_del = 0 ORDER BY id_user DESC")
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
# 🚀 MAIN
# ==========================================
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
