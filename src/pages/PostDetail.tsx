import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import UserRatingsSection from "../components/UserRatingsSection";
import dobrovolnictvoImg from "../assets/dobrovolnictvo.png";
import vzdelavanieImg from "../assets/vzdelavanie.png";
import pomocSenioromImg from "../assets/pomoc_seniorom.png";
import spolocenskaAktivitaImg from "../assets/spolocenska_aktivita.png";
import ineImg from "../assets/ine.png";

const API_BASE = "http://127.0.0.1:5000";

interface User {
  id?: number;
  id_user?: number;
  name: string;
  surname: string;
  role?: string;
}

interface Post {
  id_post: number;
  title: string;
  description: string;
  image?: string | null;
  category: string;
  name: string;
  surname: string;
  user_id: number;
  avg_rating?: number | null;
}

interface AuthorProfile {
  id_user: number;
  meno: string;
  priezvisko: string;
  mail: string;
  datum_narodenia?: string;
  mesto?: string | null;
  about?: string | null;
  rola?: string | null;
  created_at?: string;
}

const categoryImageMap: Record<string, string> = {
  dobrovolnictvo: dobrovolnictvoImg,
  vzdelavanie: vzdelavanieImg,
  pomocseniorom: pomocSenioromImg,
  spolocenskaaktivita: spolocenskaAktivitaImg,
  ine: ineImg,
};

const categoryOptions = ["Dobrovoľníctvo", "Vzdelávanie", "Pomoc seniorom", "Spoločenská aktivita", "Iné"];

const normalizeCategory = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

const resolveImage = (post?: Post | null) => {
  if (!post) return categoryImageMap.ine;
  const provided = post.image?.trim();
  if (provided) return provided;
  const normalized = normalizeCategory(post.category || "");
  return categoryImageMap[normalized] ?? categoryImageMap.ine;
};

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [post, setPost] = useState<Post | null>(null);
  const [profile, setProfile] = useState<AuthorProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formImage, setFormImage] = useState<string | null>(null);
  const [formDescription, setFormDescription] = useState("");

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setCurrentUser(JSON.parse(storedUser));
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/posts/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Nepodarilo sa nacitat prispevok.");
        return data as Post;
      })
      .then((data) => {
        setPost(data);
        setFormTitle(data.title);
        setFormCategory(data.category);
        setFormImage(data.image ?? null);
        setFormDescription(data.description);
      })
      .catch((e) => setError(e.message || "Nepodarilo sa nacitat prispevok."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!post?.user_id) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    setProfile(null);
    setProfileError(null);
    fetch(`${API_BASE}/api/profile/${post.user_id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Nepodarilo sa nacitat profil autora.");
        return data as AuthorProfile;
      })
      .then((data) => setProfile(data))
      .catch((e) => setProfileError(e.message || "Nepodarilo sa nacitat profil autora."));
  }, [post?.user_id]);

  const currentUserId = useMemo(() => currentUser?.id ?? currentUser?.id_user ?? null, [currentUser]);
  const canEdit = useMemo(() => {
    if (!post || !currentUser) return false;
    const isOwner =
      (currentUser.id ?? currentUser.id_user) === post.user_id ||
      `${currentUser.name} ${currentUser.surname}` === `${post.name} ${post.surname}`;
    return currentUser.role === "admin" || isOwner;
  }, [currentUser, post]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFormImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!post) return;
    setSaving(true);
    try {
      const payload = {
        title: formTitle,
        category: formCategory,
        description: formDescription,
        image: formImage ?? null,
      };
      const res = await fetch(`${API_BASE}/api/posts/${post.id_post}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Nepodarilo sa ulozit prispevok.");
      }
      setPost({
        ...post,
        title: formTitle,
        category: formCategory,
        description: formDescription,
        image: formImage ?? null,
      });
      setEditing(false);
    } catch (e: any) {
      alert(e.message || "Ukladanie zlyhalo.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!post) return;
    setEditing(false);
    setFormTitle(post.title);
    setFormCategory(post.category);
    setFormImage(post.image ?? null);
    setFormDescription(post.description);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-5xl mx-auto p-8">
          <p className="text-lg text-gray-700 dark:text-gray-300">Nacitavam prispevok...</p>
        </div>
      </MainLayout>
    );
  }

  if (error || !post) {
    return (
      <MainLayout>
        <div className="max-w-5xl mx-auto p-8 space-y-4">
          <button onClick={() => navigate(-1)} className="text-sm text-indigo-600 hover:underline">
            ← Spat
          </button>
          <p className="text-lg text-red-500">{error || "Prispevok sa nenasiel."}</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="text-sm text-indigo-600 hover:underline">
            ← Spat na prispevky
          </button>
          {canEdit && (
            <button
              onClick={() => setEditing((prev) => !prev)}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              {editing ? "Zrusit upravy" : "Upravit prispevok"}
            </button>
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-900 shadow-md overflow-hidden border border-gray-200 dark:border-gray-800">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-4">
              <img
                src={editing ? formImage || resolveImage(post) : resolveImage(post)}
                alt={post.title}
                className="max-h-64 w-full object-contain bg-white rounded-xl shadow-inner"
              />
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-semibold dark:bg-indigo-900/40 dark:text-indigo-200">
                  {editing ? formCategory : post.category}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 break-words">
                  {post.name} {post.surname}
                </span>
              </div>

              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Nazov</label>
                    <input
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 break-words"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Typ prispevku</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {categoryOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Obrazok</label>
                    <input type="file" accept="image/*" onChange={handleFileChange} />
                    {formImage && (
                      <img
                        src={formImage}
                        alt="Nahlad"
                        className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 max-h-40 object-contain"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Popis</label>
                    <textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      rows={5}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 break-words"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {saving ? "Ukladam..." : "Ulozit zmeny"}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200"
                    >
                      Zrusit
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 break-words">{post.title}</h1>
                  <p className="text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-line break-words">
                    {post.description}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-2">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Autor</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {post.name} {post.surname}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {profile?.rola || "Pouzivatel"} • {profile?.mesto || "nezadane mesto"}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Hodnotenie: {typeof post.avg_rating === "number" ? post.avg_rating.toFixed(1) : "—"} / 5
            </p>
            {profile?.about && (
              <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed mt-2 whitespace-pre-line">
                {profile.about}
              </p>
            )}
            {profileError && <p className="text-sm text-red-500">{profileError}</p>}
          </div>

          <UserRatingsSection
            userId={post.user_id}
            currentUserId={currentUserId}
            baseUrl={API_BASE}
            className="mt-0"
          />
        </div>
      </div>
    </MainLayout>
  );
}
