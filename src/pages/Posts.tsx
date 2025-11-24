import React, { useEffect, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import Card from "../components/Card";
import CardCreator from "../components/CardCreator";
import dobrovolnictvoImg from "../assets/dobrovolníctvo.png";
import vzdelavanieImg from "../assets/vzdelavanie.png";
import pomocSenioromImg from "../assets/pomoc_seniorom.png";
import spolocenskaAktivitaImg from "../assets/spolocenska_aktivita.png";
import ineImg from "../assets/ine.png";

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
  image?: string;
  category: string;
  name: string;
  surname: string;
}

type PostsApiResp =
  | Post[]
  | {
      items: Post[];
      pagination?: {
        page: number;
        page_size: number;
        total: number;
        pages: number;
      };
    };

const categoryImageMap: Record<string, string> = {
  dobrovolnictvo: dobrovolnictvoImg,
  vzdelavanie: vzdelavanieImg,
  pomocseniorom: pomocSenioromImg,
  spolocenskaaktivita: spolocenskaAktivitaImg,
  ine: ineImg,
};

const normalizeCategory = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

const resolveImage = (post: Post) => {
  const provided = post.image?.trim();
  if (provided) return provided;
  const normalized = normalizeCategory(post.category || "");
  return categoryImageMap[normalized] ?? categoryImageMap.ine;
};

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const lastIssuedTermRef = useRef<string>("");

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  const loadInitial = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("http://127.0.0.1:5000/api/posts");
      if (!res.ok) throw new Error("Chyba pri načítaní príspevkov");
      const data: PostsApiResp = await res.json();
      const items = Array.isArray(data) ? data : data.items;
      setPosts(items ?? []);
      setAllPosts(items ?? []);
    } catch (err: any) {
      setError(err.message || "Chyba načítania");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      const term = q.trim();

      if (!term) {
        if (controllerRef.current) controllerRef.current.abort();
        setPosts(allPosts);
        setSearching(false);
        return;
      }

      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;

      try {
        setSearching(true);
        setError(null);
        lastIssuedTermRef.current = term;
        const qs = new URLSearchParams({
          q: term,
          page: "1",
          page_size: "50",
          sort: "relevance",
        });
        const res = await fetch(`http://127.0.0.1:5000/api/posts?${qs.toString()}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(await res.text());
        const data: PostsApiResp = await res.json();
        if (lastIssuedTermRef.current !== term) return;

        const items = Array.isArray(data) ? data : data.items;
        setPosts(items ?? []);
      } catch (e: any) {
        if (e.name === "AbortError") return;
        setError(e.message || "Chyba pri vyhľadávaní");
        setPosts([]);
      } finally {
        if (lastIssuedTermRef.current === term) setSearching(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, allPosts]);

  const refreshAfterChange = async () => {
    if (q.trim()) {
      setQ((prev) => prev);
      return;
    }
    await loadInitial();
  };

  const handleAddPost = async (postData: {
    title: string;
    description: string;
    image?: string | null;
    category: string;
  }) => {
    if (!user) return alert("Musíš byť prihlásený!");
    const payload = { ...postData, user_id: user.id || user.id_user };
    const res = await fetch("http://127.0.0.1:5000/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setIsCreating(false);
      await refreshAfterChange();
    } else {
      console.error("Nepodarilo sa vytvoriť príspevok:", await res.text());
    }
  };

  const handleEditPost = async (postData: {
    title: string;
    description: string;
    image?: string | null;
    category: string;
  }) => {
    if (!editingPost) return;
    const payload = { ...postData, id_post: editingPost.id_post };
    const res = await fetch(`http://127.0.0.1:5000/api/posts/${editingPost.id_post}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setIsEditing(false);
      setEditingPost(null);
      await refreshAfterChange();
    } else {
      console.error("Nepodarilo sa upraviť príspevok:", await res.text());
    }
  };

  const handleDeletePost = async (id: number) => {
    const res = await fetch(`http://127.0.0.1:5000/api/posts/${id}`, { method: "DELETE" });
    if (res.ok) await refreshAfterChange();
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-6">Príspevky komunity</h1>
          <div className="h-10 w-full max-w-xl animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <p className="text-center mt-10 text-gray-600 dark:text-gray-300">Načítavam príspevky…</p>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto p-8 space-y-6">
          <h1 className="text-3xl font-bold">Príspevky komunity</h1>
          <div className="w-full sm:w-96">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadaj názov, popis, kategóriu alebo autora…"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Vyhľadávanie príspevkov"
            />
          </div>
          <p className="text-center text-red-500">{error}</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-8 space-y-8">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:gap-4">
            <div className="relative">
              <input
                id="post-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Hľadaj názov, popis, kategóriu alebo autora…"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                aria-label="Vyhľadávanie príspevkov"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">
                {searching ? "Hľadám…" : q.trim() ? `Výsledky: ${posts.length}` : `Príspevkov: ${posts.length}`}
              </div>
            </div>
            {user && (
              <button
                onClick={() => setIsCreating(true)}
                className="sm:justify-self-end bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl shadow-md transition shrink-0"
              >
                + Pridať príspevok
              </button>
            )}
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="text-center text-gray-600 dark:text-gray-300 py-12 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl">
            {q.trim() ? "Nenašli sa žiadne príspevky." : "Zatiaľ žiadne príspevky."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post) => (
              <div key={post.id_post} className="relative group">
                <Card
                  title={post.title}
                  description={post.description}
                  image={resolveImage(post)}
                  author={`${post.name} ${post.surname}`}
                  category={post.category}
                />
                {user &&
                  (user.role === "admin" || `${user.name} ${user.surname}` === `${post.name} ${post.surname}`) && (
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => {
                          setEditingPost(post);
                          setIsEditing(true);
                        }}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-3 py-1 rounded-md shadow-sm"
                      >
                        Upraviť
                      </button>
                      <button
                        onClick={() => handleDeletePost(post.id_post)}
                        className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded-md shadow-sm"
                      >
                        Zmazať
                      </button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}

        {isCreating && <CardCreator onClose={() => setIsCreating(false)} onSave={handleAddPost} />}
        {isEditing && editingPost && (
          <CardCreator
            onClose={() => {
              setIsEditing(false);
              setEditingPost(null);
            }}
            onSave={handleEditPost}
            initialData={editingPost}
          />
        )}
      </div>
    </MainLayout>
  );
}
