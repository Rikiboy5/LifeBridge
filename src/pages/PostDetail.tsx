import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import UserRatingsSection from "../components/UserRatingsSection";
import dobrovolnictvoImg from "../assets/dobrovolnictvo.png";
import vzdelavanieImg from "../assets/vzdelavanie.png";
import pomocSenioromImg from "../assets/pomoc_seniorom.png";
import spolocenskaAktivitaImg from "../assets/spolocenska_aktivita.png";
import ineImg from "../assets/ine.png";

const API_BASE = (() => {
  const env = (import.meta as any).env?.VITE_API_URL ?? "";
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.includes(":5173")) return origin.replace(":5173", ":5000");
    return origin;
  }
  return "";
})();

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

interface PostImage {
  uid: string;
  url: string;
  storage_path?: string;
  sort_order?: number;
  file_name?: string;
}

const normalizePostImages = (imgsRaw: any[]): PostImage[] =>
  (imgsRaw || [])
    .map((i) => ({
      uid: i.uid || i.file_uid,
      url: i.url,
      storage_path: i.storage_path,
      sort_order: i.sort_order,
      file_name: i.file_name,
    }))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

const categoryImageMap: Record<string, string> = {
  dobrovolnictvo: dobrovolnictvoImg,
  vzdelavanie: vzdelavanieImg,
  pomocseniorom: pomocSenioromImg,
  spolocenskaaktivita: spolocenskaAktivitaImg,
  ine: ineImg,
};

const categoryOptions = ["Dobrovoľníctvo", "Vzdelávanie", "Pomoc seniorom", "Spoločenská aktivita", "Iné"];
const ROLE_LABELS: Record<string, string> = {
  user_dobrovolnik: "Dobrovoľník",
  user_firma: "Firma",
  user_senior: "Dôchodca",
  admin: "Admin",
};

const roleLabel = (role?: string | null) => ROLE_LABELS[role ?? ""] || "Používateľ";

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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postImages, setPostImages] = useState<PostImage[]>([]);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formImage, setFormImage] = useState<string | null>(null);
  const [formDescription, setFormDescription] = useState("");

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const refreshImages = async (postId: number) => {
    const res = await fetch(`/api/posts/${postId}/images`);
    if (res.ok) {
      const imgs = normalizePostImages(await res.json());
      setPostImages(imgs);
      return imgs;
    }
    setPostImages([]);
    return [];
  };

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setCurrentUser(JSON.parse(storedUser));
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/posts/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Nepodarilo sa nacitat prispevok.");
        setPost(data);
        setFormTitle(data.title);
        setFormCategory(data.category);
        setFormImage(data.image ?? null);
        setFormDescription(data.description);

        const imgs = await refreshImages(data.id_post);
        if (!data.image) {
          const main = imgs.find((i) => (i.sort_order ?? 0) === 0)?.url || null;
          if (main) {
            setFormImage(main);
            setPost((prev) => (prev ? { ...prev, image: main } : prev));
          }
        }
      } catch (e: any) {
        setError(e.message || "Nepodarilo sa nacitat prispevok.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!post?.user_id) {
      setProfile(null);
      setProfileError(null);
      setAvatarUrl(null);
      return;
    }
    setProfile(null);
    setProfileError(null);
    Promise.all([
      fetch(`/api/profile/${post.user_id}`),
      fetch(`/api/profile/${post.user_id}/avatar`),
    ])
      .then(async ([profileRes, avatarRes]) => {
        const profileData = await profileRes.json();
        if (!profileRes.ok) throw new Error(profileData.error || "Nepodarilo sa nacitat profil autora.");

        let avatar: string | null = null;
        if (avatarRes.ok) {
          const a = await avatarRes.json();
          if (a?.url) avatar = `${API_BASE}${a.url}`;
        }
        return { profileData: profileData as AuthorProfile, avatar };
      })
      .then(({ profileData, avatar }) => {
        setProfile(profileData);
        setAvatarUrl(avatar);
      })
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!post) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error || new Error("Nepodarilo sa nacitat obrazok."));
        reader.readAsDataURL(file);
      });
      setFormImage(dataUrl); // uloží sa až po kliknutí na Uložiť
    } catch (err: any) {
      alert(err.message || "Nepodarilo sa nahrať obrázok.");
    } finally {
      setUploadingImage(false);
    }
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
      const res = await fetch(`/api/posts/${post.id_post}`, {
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

  useEffect(() => {
    if (editing && post) {
      setFormTitle(post.title);
      setFormCategory(post.category);
      setFormImage(post.image ?? null);
      setFormDescription(post.description);
    }
  }, [editing, post]);

  const handleExtraImagesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!post) return;
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingExtra(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/posts/${post.id_post}/image`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Nepodarilo sa nahrať obrázok.");
      }
      await refreshImages(post.id_post);
    } catch (err: any) {
      alert(err.message || "Nepodarilo sa nahrať obrázky.");
    } finally {
      setUploadingExtra(false);
      e.target.value = "";
    }
  };

  const handleDeleteImage = async (uid: string) => {
    if (!post) return;
    try {
      const res = await fetch(`/api/posts/${post.id_post}/images/${uid}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Nepodarilo sa odstrániť obrázok.");
      const imgs = await refreshImages(post.id_post);
      const mainUrl = imgs.find((i) => (i.sort_order ?? 0) === 0)?.url || null;
      if (mainUrl) {
        setFormImage((prev) => prev || mainUrl);
        setPost((prev) => (prev ? { ...prev, image: prev.image || mainUrl } : prev));
      } else {
        setFormImage(null);
        setPost((prev) => (prev ? { ...prev, image: null } : prev));
      }
    } catch (err: any) {
      alert(err.message || "Nepodarilo sa odstrániť obrázok.");
    }
  };

  const handleDeleteMainImage = async () => {
    if (!post) return;
    const main = postImages.find((img) => (img.sort_order ?? 0) === 0);
    if (!main) {
      setFormImage(null);
      setPost((prev) => (prev ? { ...prev, image: null } : prev));
      return;
    }
    try {
      const res = await fetch(`/api/posts/${post.id_post}/images/${main.uid}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Nepodarilo sa odstrániť obrázok.");
      await refreshImages(post.id_post);
      setFormImage(null);
      setPost((prev) => (prev ? { ...prev, image: null } : prev));
    } catch (err: any) {
      alert(err.message || "Nepodarilo sa odstrániť obrázok.");
    }
  };

  const mainGalleryUrl = postImages.find((img) => (img.sort_order ?? 0) === 0)?.url || null;

  const primaryImage = editing
    ? formImage ?? mainGalleryUrl ?? resolveImage(post)
    : mainGalleryUrl ?? resolveImage(post);

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
                src={primaryImage}
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
                    {(formImage || mainGalleryUrl) && (
                      <>
                        <img
                          src={formImage || mainGalleryUrl || undefined}
                          alt="Nahlad"
                          className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 max-h-40 object-contain"
                        />
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={handleDeleteMainImage}
                            className="text-xs text-red-600 hover:text-red-700"
                            disabled={saving || uploadingImage}
                          >
                            Vymazat hlavny obrazok
                          </button>
                        </div>
                      </>
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

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dalsie obrazky</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Nahraj viac obrazkov k prispevku.</p>
            </div>
            {canEdit && (
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm cursor-pointer hover:bg-indigo-700 transition">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleExtraImagesChange}
                />
                {uploadingExtra ? "Nahravam..." : "Pridat obrazky"}
              </label>
            )}
          </div>

          {postImages.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Zatial ziadne pridane obrazky.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {postImages.map((img) => (
                <div
                  key={img.uid}
                  className="relative group aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center"
                >
                  <img src={img.url} alt={img.file_name || "Obrazok"} className="w-full h-full object-cover" />
                  {canEdit && (
                    <button
                      onClick={() => handleDeleteImage(img.uid)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition bg-black/60 text-white text-xs px-2 py-1 rounded"
                    >
                      Zmazat
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-3">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Autor</p>

          <button
            type="button"
            onClick={() => navigate(`/user/${post.user_id}`)}
            className="w-full text-left rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/80 p-2 transition"
          >
            <div className="flex gap-4 items-start">
              <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-indigo-100 dark:ring-indigo-900 bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={`${post.name} ${post.surname}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold">
                    {(post.name?.[0] || "") + (post.surname?.[0] || "") || "?"}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {post.name} {post.surname}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200 text-xs font-semibold">
                    {roleLabel(profile?.rola)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {profile?.mesto || "nezadane mesto"}
                  </span>
                </div>
              </div>
            </div>
          </button>

          {profile?.about && (
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed mt-1 whitespace-pre-line break-words">
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
          pageSize={5}
        />
      </div>
    </MainLayout>
  );
}
