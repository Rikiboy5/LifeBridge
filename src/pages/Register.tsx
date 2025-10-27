import React, { useEffect, useState } from "react";

export default function Register() {
  const [form, setForm] = useState({
    meno: "",
    priezvisko: "",
    datum_narodenia: "",
    mail: "",
    heslo: "",
    hobbies: [] as number[],
  });
  const [hobbies, setHobbies] = useState<{ id_hobby: number; nazov: string }[]>([]);

  useEffect(() => {
    fetch("/api/hobbies")
      .then((res) => res.json())
      .then(setHobbies);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const toggleHobby = (id: number) => {
    setForm((prev) => ({
      ...prev,
      hobbies: prev.hobbies.includes(id)
        ? prev.hobbies.filter((h) => h !== id)
        : [...prev.hobbies, id],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    alert(data.message || data.error || "Registrovaný!");
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto mt-10 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Registrácia</h2>

      <input name="meno" placeholder="Meno" className="w-full mb-3 p-2 border rounded" onChange={handleChange} />
      <input name="priezvisko" placeholder="Priezvisko" className="w-full mb-3 p-2 border rounded" onChange={handleChange} />
      <input name="mail" placeholder="E-mail" className="w-full mb-3 p-2 border rounded" onChange={handleChange} />
      <input type="date" name="datum_narodenia" className="w-full mb-3 p-2 border rounded" onChange={handleChange} />
      <input type="password" name="heslo" placeholder="Heslo" className="w-full mb-3 p-2 border rounded" onChange={handleChange} />

      <div className="mb-4">
        <p className="font-semibold mb-1">Záľuby</p>
        {hobbies.map((h) => (
          <label key={h.id_hobby} className="block">
            <input
              type="checkbox"
              checked={form.hobbies.includes(h.id_hobby)}
              onChange={() => toggleHobby(h.id_hobby)}
            />
            <span className="ml-2">{h.nazov}</span>
          </label>
        ))}
      </div>

      <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
        Registrovať sa
      </button>
    </form>
  );
}
