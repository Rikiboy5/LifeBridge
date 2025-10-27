from flask import Blueprint, request, jsonify, session
from flask_bcrypt import Bcrypt
from datetime import datetime
from app import get_conn
import mysql.connector

bcrypt = Bcrypt()
auth_bp = Blueprint("auth", __name__)

# 🧠 Registrácia používateľa
@auth_bp.post("/api/register")
def register_user():
    data = request.get_json(force=True)
    meno = data.get("meno")
    priezvisko = data.get("priezvisko")
    datum_narodenia = data.get("datum_narodenia")
    mail = data.get("mail")
    heslo = data.get("heslo")
    hobbies = data.get("hobbies", [])
    rola = data.get("rola", "user_young")

    if not (meno and priezvisko and mail and heslo):
        return jsonify({"error": "Vyplň všetky povinné polia"}), 400

    # Hash hesla
    hashed_pw = bcrypt.generate_password_hash(heslo, 12).decode("utf-8")

    # Parsovanie dátumu (YYYY-MM-DD → DB formát)
    try:
        dob = datetime.strptime(datum_narodenia, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "Neplatný formát dátumu"}), 400

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            INSERT INTO users (meno, priezvisko, datum_narodenia, mail, heslo, rola)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (meno, priezvisko, dob, mail, hashed_pw, rola),
        )
        user_id = cur.lastrowid

        # Uloženie hobby väzieb
        for h in hobbies:
            cur.execute("INSERT INTO user_hobby (id_user, id_hobby) VALUES (%s, %s)", (user_id, h))

        conn.commit()
        return jsonify({"id_user": user_id, "meno": meno, "priezvisko": priezvisko}), 201

    except mysql.connector.IntegrityError:
        return jsonify({"error": "Tento e-mail už existuje"}), 409
    finally:
        cur.close()
        conn.close()


# 🧠 Prihlásenie používateľa
@auth_bp.post("/api/login")
def login_user():
    data = request.get_json(force=True)
    mail = data.get("mail")
    heslo = data.get("heslo")

    if not mail or not heslo:
        return jsonify({"error": "Zadaj e-mail a heslo"}), 400

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM users WHERE mail=%s", (mail,))
        user = cur.fetchone()

        if not user or not bcrypt.check_password_hash(user["heslo"], heslo):
            return jsonify({"error": "Nesprávny e-mail alebo heslo"}), 401

        # Session-like data (môžeš použiť aj JWT)
        session["user_id"] = user["id_user"]
        session["meno"] = user["meno"]
        session["priezvisko"] = user["priezvisko"]

        return jsonify({"message": "Prihlásenie úspešné", "user": user}), 200
    finally:
        cur.close()
        conn.close()
