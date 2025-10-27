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
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "root")
DB_NAME = os.getenv("DB_NAME", "LifeBridge")
DB_PORT = int(os.getenv("DB_PORT", "8889"))

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
    hobbies = data.get("hobbies")
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
            INSERT INTO users (name, surname, email, password, hobbies, birthdate)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (name, surname, email, hashed_pw, hobbies, birthdate)
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
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cur.fetchone()

        if not user:
            return jsonify({"error": "Používateľ neexistuje."}), 404

        if not bcrypt.check_password_hash(user["password"], password):
            return jsonify({"error": "Nesprávne heslo."}), 401

        return jsonify({
            "success": True,
            "user": {
                "id": user["id_user"],
                "name": user["name"],
                "surname": user["surname"],
                "email": user["email"],
            }
        }), 200
    finally:
        cur.close()
        conn.close()

# ==========================================
# 🎯 ZÁĽUBY (dropdown)
# ==========================================
@app.get("/api/hobby")
def get_hobbies():
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id_hobby, name FROM hobbies ORDER BY name ASC")
        rows = cur.fetchall()
        return jsonify(rows), 200
    finally:
        cur.close()
        conn.close()

# ==========================================
# 👥 POUŽÍVATELIA (len test)
# ==========================================
@app.get("/api/users")
def get_users():
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id_user, name, surname, email, hobbies, birthdate FROM users ORDER BY id_user DESC")
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
