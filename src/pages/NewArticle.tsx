import React, { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import { useNavigate } from "react-router-dom";

export default function NewArticle() {
  const navigate = useNavigate();

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) {
      navigate("/login");
      return;
    }
    const user = JSON.parse(raw);
    if (user.role !== "admin") {
      navigate("/");
    }
  }, [navigate]);

  const [form, setForm] = useState({ title: "", text: "" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          text: form.text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Chyba pri vytvarani clanku");

      const newId = data.id_article;

      if (imageFile && newId) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const uploadRes = await fetch(`/api/articles/${newId}/image`, {
          method: "POST",
          body: fd,
        });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) throw new Error(uploadData?.error || "Nahravanie obrazka zlyhalo.");
      }

      setSuccess("Clanok bol uspesne vytvoreny!");
      setForm({ title: "", text: "" });
      setImageFile(null);
      setImagePreview(null);

      setTimeout(() => navigate(`/articles/${newId}`), 800);
    } catch (err: any) {
      setError(err.message || "Chyba pri vytvarani clanku.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Novy clanok</h1>

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
              placeholder="Nazov clanku"
              required
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">Text clanku</label>
            <textarea
              name="text"
              value={form.text}
              onChange={onChange}
              rows={8}
              className="w-full p-3 rounded border border-gray-300 dark:bg-gray-800"
              placeholder="Obsah clanku"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block mb-1 font-medium">Obrazok</label>
            <input type="file" accept="image/*" onChange={handleImageChange} />
            {imagePreview && (
              <div className="mt-2 space-y-2">
                <img
                  src={imagePreview}
                  alt="Nahlad"
                  className="max-h-48 rounded-lg border border-gray-300 dark:border-gray-700 object-contain"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                  }}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Odstranit obrazok
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500">Ulozi sa do assets/img/articles.</p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg disabled:opacity-60"
          >
            {submitting ? "Publikujem..." : "Publikovat clanok"}
          </button>
        </form>
      </div>
    </MainLayout>
  );
}
