import React, { useEffect, useMemo, useRef, useState } from "react";
import ManImage from "../assets/img/teen.jpg";
import CardCreator from "../components/CardCreator";
import Card from "../components/Card";
import MainLayout from "../layouts/MainLayout";

type User = {
  id_user: number;
  meno: string;
  priezvisko: string;
  mail: string;
  datum_narodenia: string | null;
  mesto: string | null;
  about: string | null;
  rola?: string;
  created_at?: string;
};

type Post = {
  id_post: number;
  title: string;
  description: string;
  image?: string | null;
  category: string;
  name: string;
  surname: string;
};

// helper: normalize to YYYY-MM-DD (robustly handle various formats)
const onlyDate = (val: string | null | undefined): string => {
  if (!val) return "";
  const s = String(val).trim();
  // direct ISO or MySQL date/datetime
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  // try Date parsing and format with local tz (avoid UTC shift)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return "";
};

export default function Profile() {
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  type Hobby = { id_hobby: number; nazov: string; id_kategoria: number; kategoria_nazov?: string };
  type Category = { id_kategoria: number; nazov: string; ikona?: string; pocet_hobby?: number };
  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [selectedHobbyIds, setSelectedHobbyIds] = useState<number[]>([]);
  const [editingHobbies, setEditingHobbies] = useState(false);
  const [savingHobbies, setSavingHobbies] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [form, setForm] = useState({
    meno: "",
    priezvisko: "",
    datum_narodenia: "",
    mesto: "",
    about: "",
  });

  const baseUrl = (import.meta as any).env?.VITE_API_URL ?? "http://127.0.0.1:5000";

  // user id z localStorage
  const currentUserId = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      const u = JSON.parse(raw);
      return u?.id ?? u?.id_user ?? null;
    } catch {
      return null;
    }
  }, []);

  // načítaj profil
  useEffect(() => {
    if (!currentUserId) return;
    fetch(`${baseUrl}/api/profile/${currentUserId}`)
      .then((r) => r.json())
      .then((data) => {
        const normalized = { ...data, datum_narodenia: onlyDate(data.datum_narodenia) || null };
        setProfile(normalized);
        setForm({
          meno: data.meno ?? "",
          priezvisko: data.priezvisko ?? "",
          datum_narodenia: onlyDate(data.datum_narodenia) || "",
          mesto: data.mesto ?? "",
          about: data.about ?? "",
        });
      })
      .catch((e) => console.error("Chyba pri načítaní profilu:", e));
  }, [currentUserId]);

  // načítaj všetky hobby, kategórie a užívateľove hobby (ako pri registrácii)
  useEffect(() => {
    if (!currentUserId) return;
    (async () => {
      try {
        const [allRes, catsRes, userRes] = await Promise.all([
          fetch(`${baseUrl}/api/hobbies`),
          fetch(`${baseUrl}/api/hobby-categories`),
          fetch(`${baseUrl}/api/profile/${currentUserId}/hobbies`),
        ]);
        if (allRes.ok) setHobbies((await allRes.json()) || []);
        if (catsRes.ok) setCategories((await catsRes.json()) || []);
        if (userRes.ok) {
          const mine = await userRes.json();
          setSelectedHobbyIds((mine || []).map((h: any) => h.id_hobby));
        } else {
          setSelectedHobbyIds([]);
        }
      } catch {
        setSelectedHobbyIds([]);
      }
    })();
  }, [currentUserId]);

  const toggleHobby = (id: number) => {
    setSelectedHobbyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSaveHobbies = async () => {
    if (!currentUserId) return;
    setSavingHobbies(true);
    try {
      const res = await fetch(`${baseUrl}/api/profile/${currentUserId}/hobbies`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hobbies: selectedHobbyIds }),
      });
      if (!res.ok) {
        alert(await res.text());
        return;
      }
      setEditingHobbies(false);
    } catch {
      alert("Nepodarilo sa uložiť záľuby.");
    } finally {
      setSavingHobbies(false);
    }
  };

  // načítaj moje príspevky
  const fetchMyPosts = async () => {
    if (!currentUserId) return;
    try {
      const res = await fetch(`${baseUrl}/api/posts?author_id=${currentUserId}`);
      if (!res.ok) return;
      const data = await res.json();
      const items: Post[] = Array.isArray(data) ? data : (data.items ?? []);
      setPosts(items ?? []);
    } catch {}
  };

  useEffect(() => { fetchMyPosts(); }, [currentUserId]);

  // ensure posts load on first visit once profile/user id is known
  const postsLoadedRef = useRef(false);
  useEffect(() => {
    const uid = currentUserId || profile?.id_user;
    if (uid && !postsLoadedRef.current) {
      postsLoadedRef.current = true;
      fetchMyPosts();
    }
  }, [currentUserId, profile?.id_user]);

  // načítaj avatar (ak existuje, bez DB)
  useEffect(() => {
    if (!currentUserId) return;
    (async () => {
      try {
        const res = await fetch(`${baseUrl}/api/profile/${currentUserId}/avatar`);
        if (!res.ok) { setAvatarSrc(null); return; }
        const data = await res.json();
        if (data?.url) setAvatarSrc(`${baseUrl}${data.url}`);
      } catch {
        setAvatarSrc(null);
      }
    })();
  }, [currentUserId]);

  const fullName = profile ? `${profile.meno} ${profile.priezvisko}`.trim() : "";

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      // pošli len polia, ktoré sa reálne zmenili (partial update)
      const changed: Record<string, any> = {};
      const orig = profile;
      const cmp = (v: any) => (v == null ? "" : String(v));

      if (cmp(form.meno) !== cmp(orig.meno)) changed.meno = form.meno;
      if (cmp(form.priezvisko) !== cmp(orig.priezvisko)) changed.priezvisko = form.priezvisko;
      if (cmp(form.datum_narodenia) !== cmp(onlyDate(orig.datum_narodenia))) changed.datum_narodenia = form.datum_narodenia || null;
      if (cmp(form.mesto) !== cmp(orig.mesto)) changed.mesto = form.mesto || null;
      if (cmp(form.about) !== cmp(orig.about)) changed.about = form.about || null;

      if (Object.keys(changed).length === 0) {
        setIsEditing(false);
        return;
      }

      const res = await fetch(`${baseUrl}/api/profile/${profile.id_user}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changed),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "Nepodarilo sa uložiť profil.");
      } else {
        const normalized = { ...data, datum_narodenia: onlyDate(data.datum_narodenia) || null };
        setProfile(normalized);
        setIsEditing(false);
      }
    } catch (e) {
      alert("Chyba siete pri ukladaní profilu.");
    } finally {
      setSaving(false);
    }
  };

  // vytvorenie nového príspevku priamo z profilu
  const handleAddPost = async (postData: { title: string; description: string; image?: string | null; category: string; }) => {
    if (!currentUserId) return alert("Musíš byť prihlásený!");
    const payload = { ...postData, user_id: currentUserId };
    try {
      const res = await fetch(`${baseUrl}/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setIsCreating(false);
        await fetchMyPosts();
      } else {
        console.error("Nepodarilo sa vytvoriť príspevok:", await res.text());
      }
    } catch (e) {
      console.error("Chyba siete pri vytváraní príspevku", e);
    }
  };

  const handleEditPost = async (postData: { title: string; description: string; image?: string | null; category: string; }) => {
    if (!editingPost) return;
    try {
      const res = await fetch(`${baseUrl}/api/posts/${editingPost.id_post}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...postData, id_post: editingPost.id_post }),
      });
      if (res.ok) {
        setIsEditingPost(false);
        setEditingPost(null);
        await fetchMyPosts();
      } else {
        console.error("Nepodarilo sa upraviť príspevok:", await res.text());
      }
    } catch (e) {
      console.error("Chyba siete pri úprave príspevku", e);
    }
  };

  const handleDeletePost = async (id: number) => {
    try {
      const res = await fetch(`${baseUrl}/api/posts/${id}`, { method: "DELETE" });
      if (res.ok) await fetchMyPosts();
    } catch {}
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100">
        <div className="max-w-4xl mx-auto p-8">
          {/* Profilová hlavička */}
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-8 flex flex-col items-center text-center space-y-4">
            <img
              src={avatarSrc || ManImage}
              alt="Profilová fotka"
              className="w-32 h-32 rounded-full object-cover border-4 border-blue-600 dark:border-indigo-400 shadow"
            />
            <h2 className="text-2xl font-bold">{fullName}</h2>
            {/* O mne sa zobrazuje iba v samostatnej sekcii nižšie */}
            <button
              onClick={() => setIsEditing(true)}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition"
              disabled={!profile}
            >
              Upraviť profil
            </button>
          </div>

          {/* Záľuby (ako pri registrácii) */}
          <div className="mt-6 bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Záľuby</h3>
              <button onClick={() => setEditingHobbies((v) => !v)} className="text-sm px-3 py-1 rounded-md border hover:bg-gray-50 dark:hover:bg-gray-700">
                {editingHobbies ? "Zrušiť" : "Upraviť záľuby"}
              </button>
            </div>

            {!editingHobbies ? (
              selectedHobbyIds.length === 0 ? (
                <p className="text-gray-500">Zatiaľ nevybrané.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedHobbyIds.map((id) => {
                    const h = hobbies.find((x) => x.id_hobby === id);
                    return (
                      <span key={id} className="px-2 py-1 text-sm rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                        {h?.nazov || id}
                      </span>
                    );
                  })}
                </div>
              )
            ) : (
              <div>
                {/* Filter kategórií */}
                <div className="flex flex-wrap gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      selectedCategory === null
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    Všetko
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id_kategoria}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id_kategoria)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                        selectedCategory === cat.id_kategoria
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      }`}
                    >
                      {(cat.ikona || "")} {cat.nazov.replace(/^.+ /, '')}
                    </button>
                  ))}
                </div>

                {/* Hobby Pills */}
                <div className="flex flex-wrap gap-2 p-1 max-h-72 overflow-y-auto">
                  {(selectedCategory ? hobbies.filter(h => h.id_kategoria === selectedCategory) : hobbies).map((hobby) => (
                    <button
                      key={hobby.id_hobby}
                      type="button"
                      onClick={() => toggleHobby(hobby.id_hobby)}
                      className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
                        selectedHobbyIds.includes(hobby.id_hobby)
                          ? "bg-blue-600 text-white shadow-md transform scale-105"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      }`}
                    >
                      {hobby.nazov}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex gap-2 justify-end">
                  <button onClick={() => setEditingHobbies(false)} className="px-3 py-1 rounded-md border">Zrušiť</button>
                  <button onClick={handleSaveHobbies} disabled={savingHobbies} className="px-4 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">
                    {savingHobbies ? "Ukladám…" : "Uložiť záľuby"}
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Sekcia s informáciami */}
          <div className="mt-10 grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-3">Základné údaje</h3>
              <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                <li>Mesto: {profile?.mesto?.trim() || "Neuvedené"}</li>
                <li>Dátum narodenia: {profile?.datum_narodenia ? String(profile.datum_narodenia) : "Neuvedené"}</li>
                <li>E-mail: {profile?.mail ?? ""}</li>
              </ul>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-3">O mne</h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {profile?.about?.trim() ? profile.about : "Zatiaľ bez popisu."}
              </p>
            </div>
          </div>

          {/* Moje príspevky */}
          <div className="mt-10 bg-white dark:bg-gray-800 rounded-2xl shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Moje príspevky</h3>
              <button
                onClick={() => setIsCreating(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                ➕ Pridať príspevok
              </button>
            </div>

            {posts.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 italic">Zatiaľ žiadne príspevky.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.map((p) => (
                  <div key={p.id_post} className="relative group">
                    <Card
                      title={p.title}
                      description={p.description}
                      image={p.image || undefined}
                      author={`${p.name} ${p.surname}`}
                      category={p.category}
                    />
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => { setEditingPost(p); setIsEditingPost(true); }}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-2 py-1 rounded-md"
                      >
                        Upraviť
                      </button>
                      <button
                        onClick={() => handleDeletePost(p.id_post)}
                        className="bg-red-500 hover:bg-red-600 text-white text-sm px-2 py-1 rounded-md"
                      >
                        Zmazať
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Editor profilu (modal) */}
        {isEditing && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
              <h3 className="text-xl font-semibold mb-4">Upraviť profil</h3>

              <div className="grid grid-cols-1 gap-4">
                {/* Avatar upload (uložený na filesystem, nie v DB) */}
                <div>
                  <label className="block text-sm mb-1">Profilová fotka</label>
                  <div className="flex items-center gap-4">
                    <img src={avatarSrc || ManImage} className="w-16 h-16 rounded-full object-cover border" alt="Náhľad" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        if (!profile) return;
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.append("file", file);
                        try {
                          const res = await fetch(`${baseUrl}/api/profile/${profile.id_user}/avatar`, { method: "POST", body: fd });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data?.error || "Upload zlyhal");
                          if (data?.url) setAvatarSrc(`${baseUrl}${data.url}`);
                        } catch (err) {
                          alert("Nepodarilo sa nahrať avatar.");
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1">Meno</label>
                    <input
                      className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900"
                      value={form.meno}
                      onChange={(e) => setForm((f) => ({ ...f, meno: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Priezvisko</label>
                    <input
                      className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900"
                      value={form.priezvisko}
                      onChange={(e) => setForm((f) => ({ ...f, priezvisko: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1">Dátum narodenia</label>
                    <input
                      type="date"
                      className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900"
                      value={form.datum_narodenia || ""}
                      onChange={(e) => setForm((f) => ({ ...f, datum_narodenia: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Mesto</label>
                    <input
                      className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900"
                      value={form.mesto}
                      onChange={(e) => setForm((f) => ({ ...f, mesto: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-1">O mne</label>
                  <textarea
                    rows={5}
                    className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900"
                    value={form.about}
                    onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-700"
                  disabled={saving}
                >
                  Zrušiť
                </button>
                <button
                  onClick={handleSave}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  disabled={saving}
                >
                  {saving ? "Ukladám…" : "Uložiť"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Zobrazenie CardCreator po kliknutí */}
        {isCreating && (
          <CardCreator onClose={() => setIsCreating(false)} onSave={handleAddPost} />
        )}
        {isEditingPost && editingPost && (
          <CardCreator
            onClose={() => { setIsEditingPost(false); setEditingPost(null); }}
            onSave={handleEditPost}
            initialData={editingPost}
          />
        )}
      </div>
    </MainLayout>
  );
}
