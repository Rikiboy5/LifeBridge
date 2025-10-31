# server/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_bcrypt import Bcrypt
import mysql.connector.pooling
import os
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
    birthdate = data.get("birthdate")

    if not all([name, surname, email, password, birthdate]):
        return jsonify({"error": "Všetky polia sú povinné."}), 400

    # hash hesla
    hashed_pw = bcrypt.generate_password_hash(password, 12).decode("utf-8")

    # formát dátumu
    try:
        birthdate = datetime.strptime(birthdate, "%Y-%m-%d").strftime("%d.%m.%Y")
    except Exception:
        return jsonify({"error": "Neplatný formát dátumu (použi YYYY-MM-DD)"}), 400

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            INSERT INTO users (name, surname, email, password, birthdate)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (name, surname, email, hashed_pw, birthdate)
        )
        conn.commit()
        return jsonify({"success": True, "user": f"{name} {surname}"}), 201
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
        cur.execute("SELECT * FROM users ORDER BY id_user DESC")
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

# ==========================================
# 📝 PRÍSPEVKY
# ==========================================

@app.get("/api/posts")
def get_posts():
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT p.id_post, p.title, p.description, p.image, p.category,
                   u.meno AS name, u.priezvisko AS surname, u.location
            FROM posts p
            JOIN users u ON u.id_user = p.user_id
            ORDER BY p.id_post DESC
        """)
        return jsonify(cur.fetchall()), 200
    finally:
        cur.close()
        conn.close()


@app.post("/api/posts")
def create_post():
    data = request.get_json(force=True)
    title = data.get("title")
    description = data.get("description")
    image = data.get("image")
    category = data.get("category")
    user_id = data.get("user_id")

    if not all([title, description, category, user_id]):
        return jsonify({"error": "Všetky polia sú povinné."}), 400

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO posts (title, description, image, category, user_id)
            VALUES (%s, %s, %s, %s, %s)
        """, (title, description, image, category, user_id))
        conn.commit()
        return jsonify({"success": True}), 201
    finally:
        cur.close()
        conn.close()


@app.delete("/api/posts/<int:post_id>")
def delete_post(post_id):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM posts WHERE id_post = %s", (post_id,))
        conn.commit()
        return jsonify({"success": True}), 200
    finally:
        cur.close()
        conn.close()
