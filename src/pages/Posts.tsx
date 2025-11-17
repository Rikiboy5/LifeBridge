import React, { useEffect, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import Card from "../components/Card";
import CardCreator from "../components/CardCreator";

interface User {
  id?: number;
  id_user?: number;
  name: string;
  surname: string;
  role?: string; // 👈 pridane
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

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]); // cache „default view“
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // vyhľadávanie – UX toolbar
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const lastIssuedTermRef = useRef<string>("");

  // načítanie používateľa
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  // helper: prvotné načítanie
  const loadInitial = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("http://127.0.0.1:5000/api/posts");
      if (!res.ok) throw new Error("Chyba pri načítaní príspevkov");
      const data: PostsApiResp = await res.json();
      const items = Array.isArray(data) ? data : data.items;
      setPosts(items ?? []);
      setAllPosts(items ?? []); // cache pre rýchly návrat po zmazaní q
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

  // vyhľadávanie s debounce + abort
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      const term = q.trim();

      // keď je prázdne -> okamžite zobraz cache, nerob ďalší fetch
      if (!term) {
        if (controllerRef.current) controllerRef.current.abort();
        setPosts(allPosts);
        setSearching(false);
        return;
      }

      // zruš predchádzajúci request
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
        const res = await fetch(
          `http://127.0.0.1:5000/api/posts?${qs.toString()}`,
          {
            signal: ctrl.signal,
          }
        );
        if (!res.ok) throw new Error(await res.text());
        const data: PostsApiResp = await res.json();
        // ignoruj, ak medzičasom používateľ zmenil term a tento response je už „stará“ odpoveď
        if (lastIssuedTermRef.current !== term) return;

        const items = Array.isArray(data) ? data : data.items;
        setPosts(items ?? []);
      } catch (e: any) {
        if (e.name === "AbortError") return; // tiché zrušenie
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

  // CRUD – po akcii obnov „aktuálny pohľad“ (ak je q, sprav search; inak default)
  const refreshAfterChange = async () => {
    if (q.trim()) {
      // zopakuj posledné hľadanie
      setQ((prev) => prev); // necháme efekt zareagovať; netreba nič viac
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
      console.error(
        "Nepodarilo sa vytvoriť príspevok:",
        await res.text()
      );
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
    const res = await fetch(
      `http://127.0.0.1:5000/api/posts/${editingPost.id_post}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (res.ok) {
      setIsEditing(false);
      setEditingPost(null);
      await refreshAfterChange();
    } else {
      console.error(
        "Nepodarilo sa upraviť príspevok:",
        await res.text()
      );
    }
  };

  const handleDeletePost = async (id: number) => {
    const res = await fetch(`http://127.0.0.1:5000/api/posts/${id}`, {
      method: "DELETE",
    });
    if (res.ok) await refreshAfterChange();
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-6">
            📝 Príspevky používateľov
          </h1>
          <div className="h-10 w-full max-w-xl animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <p className="text-center mt-10">Načítavam príspevky…</p>
        </div>
      </MainLayout>
    );
  }
  if (error) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-6">
            📝 Príspevky používateľov
          </h1>
          <div className="w-full sm:w-96">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadaj názov, popis, kategóriu alebo autora…"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Vyhľadávanie príspevkov"
            />
          </div>
          <p className="text-center mt-10 text-red-500">{error}</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-8">
        {/* HEADER + TOOLBAR */}
        <div className="mb-4">
          <h1 className="text-3xl font-bold">📝 Príspevky používateľov</h1>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Hľadaj názov, popis, kategóriu alebo autora…"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Vyhľadávanie príspevkov"
              />
              <div className="text-xs text-gray-500 mt-1">
                {q.trim()
                  ? searching
                    ? "Hľadám…"
                    : `Výsledky: ${posts.length}`
                  : `Počet príspevkov: ${posts.length}`}
              </div>
            </div>

            {user && (
              <button
                onClick={() => setIsCreating(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition"
              >
                ➕ Pridať príspevok
              </button>
            )}
          </div>
        </div>

        {/* LIST */}
        {posts.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-center">
            {q.trim()
              ? "Nenašli sa žiadne príspevky."
              : "Zatiaľ žiadne príspevky."}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post) => (
              <div key={post.id_post} className="relative group">
                <Card
                  title={post.title}
                  description={post.description}
                  image={post.image}
                  author={`${post.name} ${post.surname}`}
                  category={post.category}
                />
                {user &&
                  (user.role === "admin" ||
                    `${user.name} ${user.surname}` ===
                      `${post.name} ${post.surname}`) && (
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => {
                          setEditingPost(post);
                          setIsEditing(true);
                        }}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-2 py-1 rounded-md"
                      >
                        🖊️
                      </button>
                      <button
                        onClick={() => handleDeletePost(post.id_post)}
                        className="bg-red-500 hover:bg-red-600 text-white text-sm px-2 py-1 rounded-md"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}

        {/* FORMULÁRE */}
        {isCreating && (
          <CardCreator
            onClose={() => setIsCreating(false)}
            onSave={handleAddPost}
          />
        )}
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