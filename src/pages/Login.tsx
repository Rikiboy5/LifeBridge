import React, { useState } from "react";

export default function Login() {
  const [form, setForm] = useState({ mail: "", heslo: "" });
  const [user, setUser] = useState<any>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.user) setUser(data.user);
    alert(data.message || data.error);
  };

  return (
    <div className="max-w-md mx-auto mt-10 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Prihlásenie</h2>
      <form onSubmit={handleSubmit}>
        <input name="mail" placeholder="E-mail" className="w-full mb-3 p-2 border rounded" onChange={handleChange} />
        <input type="password" name="heslo" placeholder="Heslo" className="w-full mb-3 p-2 border rounded" onChange={handleChange} />
        <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700">
          Prihlásiť sa
        </button>
      </form>
      {user && (
        <p className="mt-4 text-center text-green-500">
          Vitaj späť, {user.meno} {user.priezvisko}!
        </p>
      )}
    </div>
  );
}
