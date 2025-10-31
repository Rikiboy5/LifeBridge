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
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id_user, meno, priezvisko, mail, datum_narodenia, rola FROM users WHERE soft_del = 0 ORDER BY id_user DESC")
        rows = cur.fetchall()
        return jsonify(rows), 200
    finally:
        cur.close()
        conn.close()

# ==========================================
# 🚀 MAIN
# ==========================================
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
