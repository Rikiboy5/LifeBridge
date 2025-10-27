import React, { useEffect, useState } from "react";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    surname: "",
    email: "",
    password: "",
    birthdate: "",
  });
  const [message, setMessage] = useState("");

  // Načítanie záľub z backendu
  useEffect(() => {
    fetch("/api/hobby")
      .then((res) => res.json())
      .catch(() => setMessage("Nepodarilo sa načítať záľuby 😢"));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          surname: form.surname,
          email: form.email,
          password: form.password,
          birthdate: form.birthdate,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chyba pri registrácii");

      setMessage(`Úspešne zaregistrovaný ako ${data.user}`);
      setForm({ name: "", surname: "", email: "", password: "", birthdate: ""});
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-8 w-full max-w-md space-y-4"
      >
        <h2 className="text-2xl font-bold text-center">Registrácia</h2>

        <input
          type="text"
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Meno"
          className="w-full p-2 border rounded-md"
        />
        <input
          type="text"
          name="surname"
          value={form.surname}
          onChange={handleChange}
          placeholder="Priezvisko"
          className="w-full p-2 border rounded-md"
        />
        <input
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          placeholder="Email"
          className="w-full p-2 border rounded-md"
        />
        <input
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          placeholder="Heslo"
          className="w-full p-2 border rounded-md"
        />
        <input
          type="date"
          name="birthdate"
          value={form.birthdate}
          onChange={handleChange}
          className="w-full p-2 border rounded-md"
        />


        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition"
        >
          Registrovať
        </button>

        {message && <p className="text-center mt-2 text-sm">{message}</p>}
      </form>
    </div>
  );
}
