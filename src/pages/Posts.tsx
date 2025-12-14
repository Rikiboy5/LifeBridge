import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Card from "../components/Card";
import CardCreator from "../components/CardCreator";
import dobrovolnictvoImg from "../assets/dobrovolnictvo.png";
import vzdelavanieImg from "../assets/vzdelavanie.png";
import pomocSenioromImg from "../assets/pomoc_seniorom.png";
import spolocenskaAktivitaImg from "../assets/spolocenska_aktivita.png";
import ineImg from "../assets/ine.png";

const API_BASE = "";

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
  user_id: number;
  rola?: string;
  avg_rating?: number | null;
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

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "Vsetci" },
  { value: "user_dobrovolnik", label: "Dobrovolnici" },
  { value: "user_firma", label: "Firmy" },
  { value: "user_senior", label: "Seniori" },
];

const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "Vsetky typy" },
  { value: "dobrovolnictvo", label: "Dobrovolnictvo" },
  { value: "vzdelavanie", label: "Vzdelavanie" },
  { value: "pomoc_seniorom", label: "Pomoc seniorom" },
  { value: "spolocenska_aktivita", label: "Spolocenska aktivita" },
  { value: "ine", label: "Ine" },
];

// Map UI slug values to DB/display category names
const CATEGORY_VALUE_TO_DB: Record<string, string | string[]> = {
  dobrovolnictvo: "Dobrovolnictvo",
  vzdelavanie: "Vzdelavanie",
  pomoc_seniorom: "Pomoc seniorom",
  // include variant with diacritics to match DB values
  spolocenska_aktivita: ["Spolocenska aktivita", "Spoločenská aktivita"],
  ine: ["Ine", "Iné"],
};

const SORT_OPTIONS = [
  { value: "id_desc", label: "Najnovsie" },
  { value: "id_asc", label: "Najstarsie" },
  { value: "title_asc", label: "Nazov A-Z" },
  { value: "title_desc", label: "Nazov Z-A" },
];

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
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOption, setSortOption] = useState("id_desc");
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  const fetchPosts = async (signal?: AbortSignal) => {
    const term = q.trim();
    const usingSearch = term.length > 0;

    const qs = new URLSearchParams({
      page: "1",
      page_size: "50",
      sort: usingSearch ? "relevance" : sortOption,
    });
    if (usingSearch) qs.set("q", term);
    if (roleFilter !== "all") qs.set("role", roleFilter);
    const categoryValuesRaw = CATEGORY_VALUE_TO_DB[categoryFilter];
    const categoryValues = Array.isArray(categoryValuesRaw)
      ? categoryValuesRaw
      : categoryFilter === "all"
      ? []
      : [categoryValuesRaw || categoryFilter];

    const normalizedCategories = categoryValues
      .map((c) => c.replace(/_/g, " ").trim())
      .filter(Boolean);

    if (normalizedCategories.length > 0) {
      const csv = normalizedCategories.join(",");
      qs.set("category", csv);
      qs.set("type", csv);
    }

    try {
      if (!hasLoadedOnce) setLoading(true);
      setSearching(usingSearch);
      setError(null);

      const res = await fetch(`/api/posts?${qs.toString()}`, {
        signal,
      });
      if (!res.ok) throw new Error(await res.text());

      const data: PostsApiResp = await res.json();
      const items = Array.isArray(data) ? data : data.items;
      setPosts(items ?? []);
      setHasLoadedOnce(true);
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setError(e.message || "Chyba pri nacitani prispevkov");
      setPosts([]);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const ctrl = new AbortController();
    debounceRef.current = window.setTimeout(async () => {
      await fetchPosts(ctrl.signal);
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      ctrl.abort();
    };
  }, [q, roleFilter, categoryFilter, sortOption]);

  const refreshAfterChange = async () => {
    await fetchPosts();
  };

  const handleAddPost = async (postData: {
    title: string;
    description: string;
    image?: string | null;
    category: string;
  }) => {
    if (!user) return alert("Musis byt prihlaseny!");
    const payload = { ...postData, user_id: user.id || user.id_user };
    const res = await fetch(`/api/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setIsCreating(false);
      await refreshAfterChange();
    } else {
      console.error("Nepodarilo sa vytvorit prispevok:", await res.text());
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
    const res = await fetch(`/api/posts/${editingPost.id_post}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setIsEditing(false);
      setEditingPost(null);
      await refreshAfterChange();
    } else {
      console.error("Nepodarilo sa upravit prispevok:", await res.text());
    }
  };

  const handleDeletePost = async (id: number) => {
    const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
    if (res.ok) await refreshAfterChange();
  };

  const handleOpenDetail = (id: number) => {
    navigate(`/posts/${id}`);
  };

  const currentUserName = useMemo(() => (user ? `${user.name} ${user.surname}` : ""), [user]);

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-6">Prispevky komunity</h1>
          <div className="h-10 w-full max-w-xl animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <p className="text-center mt-10 text-gray-600 dark:text-gray-300">Nacitavam prispevky...</p>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto p-8 space-y-6">
          <h1 className="text-3xl font-bold">Prispevky komunity</h1>
          <div className="w-full sm:w-96">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hladaj nazov, popis, kategoriu alebo autora..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Vyhladavanie prispevkov"
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
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:gap-4">
              <div className="relative">
                <input
                  id="post-search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Hladaj nazov, popis, kategoriu alebo autora..."
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  aria-label="Vyhladavanie prispevkov"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none">
                  ?
                </span>
              </div>
              {user && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="sm:justify-self-end bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl shadow-md transition shrink-0"
                >
                  + Pridat prispevok
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full border rounded-2xl px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700"
                aria-label="Filter role autora"
              >
                {ROLE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full border rounded-2xl px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700"
                aria-label="Filter podla typu prispevku"
              >
                {CATEGORY_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="w-full border rounded-2xl px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700"
                aria-label="Triedenie prispevkov"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
              <span>
                {searching
                  ? "Hladam..."
                  : q.trim()
                  ? `Vysledky: ${posts.length}`
                  : `Prispevkov: ${posts.length}`}
              </span>
              {roleFilter !== "all" || categoryFilter !== "all" ? (
                <span className="text-[11px] text-indigo-600 dark:text-indigo-300">
                  Aktivne filtre
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="text-center text-gray-600 dark:text-gray-300 py-12 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl">
            {q.trim() ? "Nenaisli sa ziadne prispevky." : "Zatial ziadne prispevky."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 items-stretch">
            {posts.map((post) => (
              <div key={post.id_post} className="relative group h-full">
                <Card
                  title={post.title}
                  description={post.description}
                  image={resolveImage(post)}
                  author={`${post.name} ${post.surname}`}
                  category={post.category}
                  rating={typeof post.avg_rating === "number" ? post.avg_rating : undefined}
                  onClick={() => handleOpenDetail(post.id_post)}
                />
                {user &&
                  (user.role === "admin" || currentUserName === `${post.name} ${post.surname}`) && (
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => {
                          setEditingPost(post);
                          setIsEditing(true);
                        }}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-3 py-1 rounded-md shadow-sm"
                      >
                        Upravit
                      </button>
                      <button
                        onClick={() => handleDeletePost(post.id_post)}
                        className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded-md shadow-sm"
                      >
                        Zmazat
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
