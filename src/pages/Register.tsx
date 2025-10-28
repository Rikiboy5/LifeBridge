import React, { useState } from "react";
import MainLayout from "../layouts/MainLayout";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    surname: "",
    email: "",
    password: "",
    birthdate: "",
  });
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setSuccess(false);

    if (!form.name || !form.surname || !form.email || !form.password || !form.birthdate) {
      setMessage("Vyplň všetky polia.");
      return;
    }

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registrácia zlyhala");

      setSuccess(true);
      setMessage(`✅ Úspešne si sa zaregistroval ako ${data.user}`);
      setForm({ name: "", surname: "", email: "", password: "", birthdate: "" });
    } catch (err: any) {
      setMessage("❌ " + err.message);
    }
  };

  return (
    <MainLayout>
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-900 shadow-xl rounded-2xl p-8 w-full max-w-md text-gray-800 dark:text-gray-100 space-y-4"
      >
        <h2 className="text-2xl font-bold text-center text-blue-700 dark:text-blue-400">
          Registrácia používateľa
        </h2>

        <input
          type="text"
          name="name"
          placeholder="Meno"
          value={form.name}
          onChange={handleChange}
          className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none"
        />
        <input
          type="text"
          name="surname"
          placeholder="Priezvisko"
          value={form.surname}
          onChange={handleChange}
          className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none"
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none"
        />
        <input
          type="password"
          name="password"
          placeholder="Heslo"
          value={form.password}
          onChange={handleChange}
          className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none"
        />
        <label className="block text-sm mt-2 text-gray-600 dark:text-gray-300">Dátum narodenia</label>
        <input
          type="date"
          name="birthdate"
          value={form.birthdate}
          onChange={handleChange}
          className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none"
        />

        <button
          type="submit"
          className="w-full mt-4 bg-blue-600 text-white font-semibold p-2 rounded-md hover:bg-blue-700 transition"
        >
          Registrovať
        </button>

        {message && (
          <p
            className={`text-center mt-3 text-sm ${
              success ? "text-green-600 dark:text-green-400" : "text-red-500"
            }`}
          >
            {message}
          </p>
        )}
      </form>
    </div>
    </MainLayout>
  );
  
}
