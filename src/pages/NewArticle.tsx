import React, { useState, useEffect } from "react";
import MainLayout from "../layouts/MainLayout";
import { useNavigate } from "react-router-dom";

export default function NewArticle() {
    useEffect(() => {
  const u = localStorage.getItem("user");
  if (!u) {
    navigate("/login");
    return;
  }

  const user = JSON.parse(u);
  if (user.role !== "admin") {
    navigate("/");  // zákaz
  }
}, []);


  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: "",
    text: "",
    image_url: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const submit = async (e: React.FormEvent) => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
  ...form,
  user_id: user?.id_user,
}),

      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Chyba pri vytváraní článku");

      setSuccess("Článok bol úspešne vytvorený!");
      setForm({ title: "", text: "", image_url: "" });

      setTimeout(() => navigate(`/articles/${data.id_article}`), 1000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">📝 Nový článok</h1>

        {error && <p className="bg-red-200 text-red-700 p-3 rounded mb-4">{error}</p>}
        {success && <p className="bg-green-200 text-green-700 p-3 rounded mb-4">{success}</p>}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block mb-1 font-medium">Nadpis</label>
            <input
              name="title"
              value={form.title}
              onChange={onChange}
              className="w-full p-3 rounded border border-gray-300 dark:bg-gray-800"
              placeholder="Názov článku"
              required
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">Text článku</label>
            <textarea
              name="text"
              value={form.text}
              onChange={onChange}
              rows={8}
              className="w-full p-3 rounded border border-gray-300 dark:bg-gray-800"
              placeholder="Obsah článku"
              required
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">Obrázok (URL)</label>
            <input
              name="image_url"
              value={form.image_url}
              onChange={onChange}
              className="w-full p-3 rounded border border-gray-300 dark:bg-gray-800"
              placeholder="https://example.com/obrazok.jpg"
            />
          </div>

          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg"
          >
            Publikovať článok
          </button>
        </form>
      </div>
    </MainLayout>
  );
}
