import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";

interface ArticleDetailType {
  id_article: number;
  title: string;
  text: string;
  image_url?: string | null;
  created_at?: string;
}

export default function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [article, setArticle] = useState<ArticleDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ title: string; text: string }>({ title: "", text: "" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        setIsAdmin(u?.role === "admin");
      }
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const fetchArticle = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/articles/${id}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Nepodarilo sa nacitat clanok");
      }
      setArticle(data);
      setForm({ title: data.title, text: data.text });
      setImagePreview(data.image_url || null);
    } catch (e: any) {
      setError(e.message || "Chyba pri nacitani clanku");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    if (!article) return;
    setSaving(true);
    try {
      const dirtyTitle = form.title !== article.title;
      const dirtyText = form.text !== article.text;
      let updated = { ...article };

      if (dirtyTitle || dirtyText || removeImage) {
        const payload: any = {
          title: form.title,
          text: form.text,
          remove_image: removeImage,
        };
        const res = await fetch(`/api/articles/${article.id_article}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Ukladanie zlyhalo.");
        const newImage =
          removeImage
            ? null
            : data?.image_url ?? updated.image_url ?? null;
        updated = {
          ...updated,
          title: form.title,
          text: form.text,
          image_url: newImage,
        };
      }

      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const up = await fetch(`/api/articles/${article.id_article}/image`, { method: "POST", body: fd });
        const upData = await up.json().catch(() => null);
        if (!up.ok) throw new Error(upData?.error || "Upload obrazka zlyhal.");
        updated.image_url = upData?.url || updated.image_url || null;
      }

      setArticle(updated);
      setEditing(false);
      setRemoveImage(false);
      setImageFile(null);
      setImagePreview(updated.image_url || null);
    } catch (err: any) {
      alert(err.message || "Ukladanie zlyhalo.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!article) return;
    if (!window.confirm("Zmazat tento clanok?")) return;
    const res = await fetch(`/api/articles/${article.id_article}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || "Mazanie zlyhalo.");
      return;
    }
    navigate("/");
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {loading && <p>Nacitavam clanok...</p>}
        {error && <p className="text-red-500">{error}</p>}
        {article && (
          <>
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-4xl font-bold break-words">{article.title}</h1>
              {isAdmin && (
                <div className="flex gap-2">
                  <button onClick={() => setEditing((v) => !v)} className="text-sm text-blue-600 hover:text-blue-700">
                    {editing ? "Zrusit" : "Upravit"}
                  </button>
                  <button onClick={handleDelete} className="text-sm text-red-600 hover:text-red-700">
                    Zmazat
                  </button>
                </div>
              )}
            </div>

            {editing ? (
              <div className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nadpis</label>
                  <input
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Text</label>
                  <textarea
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                    rows={10}
                    value={form.text}
                    onChange={(e) => setForm((prev) => ({ ...prev, text: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Obrazok</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setImageFile(file);
                      setRemoveImage(false);
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => setImagePreview(reader.result as string);
                        reader.readAsDataURL(file);
                      } else {
                        setImagePreview(null);
                      }
                    }}
                  />
                  {(imagePreview || article.image_url) && !removeImage && (
                    <div className="flex items-start gap-3">
                      <img
                        src={imagePreview || article.image_url || undefined}
                        alt="Nahlad"
                        className="h-24 w-24 object-contain rounded border border-gray-200 dark:border-gray-700"
                      />
                      <button
                        type="button"
                        className="text-sm text-red-600 hover:text-red-700"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                          setRemoveImage(true);
                        }}
                      >
                        Odstranit obrazok
                      </button>
                    </div>
                  )}
                  {removeImage && <p className="text-xs text-red-600">Obrazok bude po ulozeni odstraneny.</p>}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving ? "Ukladam..." : "Ulozit"}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setForm({ title: article.title, text: article.text });
                      setImageFile(null);
                      setImagePreview(article.image_url || null);
                      setRemoveImage(false);
                    }}
                    className="px-4 py-2 rounded border border-gray-300 dark:border-gray-700"
                    disabled={saving}
                  >
                    Zrusit
                  </button>
                </div>
              </div>
            ) : (
              <>
                {article.image_url && (
                  <img
                    src={article.image_url}
                    alt={article.title}
                    className="w-full max-w-2xl mx-auto rounded-xl shadow-md object-contain max-h-[320px]"
                  />
                )}

                <p className="text-lg leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-line break-words break-all">
                  {article.text}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
