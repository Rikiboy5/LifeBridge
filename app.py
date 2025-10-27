# server/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector.pooling
from auth import auth_bp, bcrypt
app.register_blueprint(auth_bp)
bcrypt.init_app(app)

import os

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})  # dev: povoľ všetko; v produkcii zúž

# DB config z env
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "root")
DB_NAME = os.getenv("DB_NAME", "LifeBridge")
DB_PORT = int(os.getenv("DB_PORT", "8889"))

# MySQL connection pool
pool = mysql.connector.pooling.MySQLConnectionPool(
    pool_name="vite_pool",
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

@app.get("/api/users")
def get_users():
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM users ORDER BY id_user DESC")
        rows = cur.fetchall()
        return jsonify(rows), 200
    finally:
        cur.close(); conn.close()

@app.post("/api/users")
def create_user():
    data = request.get_json(force=True)
    name, email = data.get("name"), data.get("email")
    if not name or not email:
        return jsonify({"error": "name and email required"}), 400
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("INSERT INTO users(name, email) VALUES(%s, %s)", (name, email))
        user_id = cur.lastrowid
        cur.execute("SELECT id, name, email FROM users WHERE id=%s", (user_id,))
        return jsonify(cur.fetchone()), 201
    finally:
        cur.close(); conn.close()

@app.delete("/api/users/<int:user_id>")
def delete_user(user_id: int):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE id=%s", (user_id,))
        return jsonify({"deleted": user_id}), 200
    finally:
        cur.close(); conn.close()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
