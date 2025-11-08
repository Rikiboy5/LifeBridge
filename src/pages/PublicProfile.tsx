import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Card from "../components/Card";
import DefaultAvatar from "../assets/img/teen.jpg";

type User = {
  id_user: number;
  meno: string;
  priezvisko: string;
  mail: string;
  datum_narodenia?: string | null;
  mesto?: string | null;
  about?: string | null;
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

type Hobby = { id_hobby: number; nazov: string; id_kategoria: number; kategoria_nazov?: string };

const onlyDate = (val?: string | null) => {
  if (!val) return "";
  const s = String(val).trim();
  // direct ISO/MySQL prefix
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  // try parse to local date
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  // fallback: find any yyyy-mm-dd anywhere in string
  const m2 = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m2 ? m2[1] : "";
};

export default function PublicProfile() {
  const { id } = useParams<{ id: string }>();
  const userId = useMemo(() => Number(id), [id]);
  const baseUrl = (import.meta as any).env?.VITE_API_URL ?? "http://127.0.0.1:5000";
  const navigate = useNavigate();

  // if opening own public profile, redirect to private profile route
  const currentUserId = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      const u = JSON.parse(raw);
      return u?.id ?? u?.id_user ?? null;
    } catch { return null; }
  }, []);

  useEffect(() => {
    if (currentUserId && Number(currentUserId) === Number(userId)) {
      navigate("/profil", { replace: true });
    }
  }, [currentUserId, userId, navigate]);

  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [avatar, setAvatar] = useState<string>(DefaultAvatar);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [uRes, pRes, hRes, aRes] = await Promise.all([
          fetch(`${baseUrl}/api/profile/${userId}`),
          fetch(`${baseUrl}/api/posts?author_id=${userId}`),
          fetch(`${baseUrl}/api/profile/${userId}/hobbies`),
          fetch(`${baseUrl}/api/profile/${userId}/avatar`),
        ]);
        if (!uRes.ok) throw new Error("Nepodarilo sa načítať profil");
        const u: User = await uRes.json();
        const pData = await pRes.json();
        const pItems: Post[] = Array.isArray(pData) ? pData : (pData.items ?? []);
        const hItems: Hobby[] = hRes.ok ? await hRes.json() : [];
        let avatarUrl = DefaultAvatar;
        if (aRes.ok) {
          const a = await aRes.json();
          if (a?.url) avatarUrl = `${baseUrl}${a.url}`;
        }
        if (!mounted) return;
        setUser(u);
        setPosts(pItems ?? []);
        setHobbies(hItems ?? []);
        setAvatar(avatarUrl);
      } catch (e: any) {
        if (!mounted) return;
        setError(e.message || "Chyba načítania");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [userId]);

  if (loading) return <MainLayout><p className="text-center mt-10">Načítavam profil…</p></MainLayout>;
  if (error || !user) return <MainLayout><p className="text-center mt-10 text-red-500">{error || "Profil neexistuje"}</p></MainLayout>;

  const fullName = `${user.meno} ${user.priezvisko}`.trim();

  return (
    <MainLayout>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100">
        <div className="max-w-4xl mx-auto p-8">
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-8 flex flex-col items-center text-center space-y-4">
            <img src={avatar} alt="Profilová fotka" className="w-32 h-32 rounded-full object-cover border-4 border-blue-600 dark:border-indigo-400 shadow" />
            <h2 className="text-2xl font-bold">{fullName}</h2>
          </div>

          {/* pôvodná štruktúra bez záložiek */}
          <div className="mt-10 grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-3">Základné údaje</h3>
              <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                <li>E-mail: {user.mail}</li>
                {user.mesto && <li>Mesto: {user.mesto}</li>}
                {user.datum_narodenia && <li>Dátum narodenia: {onlyDate(user.datum_narodenia)}</li>}
              </ul>
            </div>
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-3">O mne</h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{user.about?.trim() || "Zatiaľ bez popisu."}</p>
            </div>
          </div>

          <div className="mt-6 bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-3">Záľuby</h3>
            {hobbies.length === 0 ? (
              <p className="text-gray-500">Zatiaľ nevybrané.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {hobbies.map(h => (
                  <span key={h.id_hobby} className="px-2 py-1 text-sm rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                    {h.nazov}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-10 bg-white dark:bg-gray-800 rounded-2xl shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Príspevky používateľa</h3>
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
