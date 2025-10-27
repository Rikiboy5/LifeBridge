from flask import Blueprint, request, jsonify
from flask_bcrypt import Bcrypt
import mysql.connector
from app import get_conn  # teraz už nebude robiť cyklus, lebo app je už načítaný

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
bcrypt = Bcrypt()

@auth_bp.post("/register")
def register_user():
    data = request.get_json(force=True)
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")
    hobbies = data.get("hobbies")
    birthdate = data.get("birthdate")

    if not all([name, email, password]):
        return jsonify({"error": "Missing fields"}), 400

    hashed_pw = bcrypt.generate_password_hash(password, 12).decode("utf-8")

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (name, email, password, hobbies, birthdate) VALUES (%s, %s, %s, %s, %s)",
            (name, email, hashed_pw, hobbies, birthdate)
        )
        conn.commit()
        return jsonify({"success": True, "user": name}), 201
    finally:
        cur.close(); conn.close()
