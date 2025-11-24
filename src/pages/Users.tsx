import React, { useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import { useLocation, useNavigate } from "react-router-dom";

interface User {
  id_user: number;
  meno: string;
  priezvisko: string;
  mail: string;
  rola?: string;
  avg_rating?: number | null;
  rating_count?: number | null;
  similarity?: number | null;
  similarity_percent?: number | null;
}

type UsersApiResp =
  | User[]
  | {
      items: User[];
      pagination?: { page: number; page_size: number; total: number; pages: number };
    };

type CurrentUser = {
  id?: number;
  id_user?: number;
  name?: string;
  surname?: string;
  role?: string;
};

const ROLE_LABELS: Record<string, string> = {
  user_dobrovolnik: "Dobrovoľník",
  user_firma: "Firma",
  user_senior: "Dôchodca",
};

const roleLabel = (role?: string | null) => ROLE_LABELS[role ?? ""] || "Používateľ";

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "Všetci" },
  { value: "user_dobrovolnik", label: "Dobrovoľníci" },
  { value: "user_firma", label: "Firmy" },
  { value: "user_senior", label: "Dôchodcovia" },
];

const SORT_OPTIONS = [
  { value: "id_desc", label: "Najnovší" },
  { value: "name_asc", label: "Meno A→Z" },
  { value: "name_desc", label: "Meno Z→A" },
  { value: "rating_desc", label: "Najlepšie hodnotenie" },
  { value: "rating_asc", label: "Najslabšie hodnotenie" },
];

export default function Users() {
  const navigate = useNavigate();
  const location = useLocation();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortOption, setSortOption] = useState("id_desc");
  const [avatars, setAvatars] = useState<Record<number, string | null>>({});

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const baseUrl =
    (import.meta as any).env?.VITE_API_URL ?? "http://127.0.0.1:5000";

  const initialFetchRef = useRef(false);
  const searchDebounceRef = useRef<number | null>(null);

  // match mód z query parametru ?matchFor=<id>
  const matchUserId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("matchFor");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);

  const isMatchMode = matchUserId !== null;

  // načítanie prihláseného používateľa
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) setCurrentUser(JSON.parse(raw));
      else setCurrentUser(null);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  const currentUserId = currentUser?.id ?? currentUser?.id_user ?? null;
  const isAdmin = currentUser?.role === "admin" || currentUserId === 1;

  // keď prepneme do match módu, zresetujeme textové vyhľadávanie
  useEffect(() => {
    if (isMatchMode) {
      setQ("");
    }
  }, [isMatchMode]);

  // základné načítanie zoznamu / match zoznamu
  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async () => {
      const isInitial = !initialFetchRef.current;
      if (isInitial) {
        setLoading(true);
      } else {
        setSearching(true);
      }

      try {
        let endpoint: string;

        if (isMatchMode && matchUserId) {
          const params = new URLSearchParams({
            top_n: "50",
          });
          endpoint = `/api/match/${matchUserId}?${params.toString()}`;
        } else {
          const params = new URLSearchParams({
            page: "1",
            page_size: "50",
            sort: sortOption,
          });
          if (roleFilter !== "all") params.set("role", roleFilter);
          endpoint = `/api/users?${params.toString()}`;
        }

        const res = await fetch(endpoint);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Chyba načítania používateľov.");
        }
        const data: UsersApiResp = await res.json();
        const items = (Array.isArray(data) ? data : data.items) ?? [];
        if (!cancelled) {
          setUsers(items);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || "Chyba načítania používateľov.");
          setUsers([]);
        }
      } finally {
        if (!cancelled) {
          if (!initialFetchRef.current) {
            initialFetchRef.current = true;
            setLoading(false);
          } else {
            setSearching(false);
          }
        }
      }
    };

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [isMatchMode, matchUserId, roleFilter, sortOption]);

  // server-side vyhľadávanie (sentence embeddings) – iba mimo match módu
  useEffect(() => {
    if (isMatchMode) return;

    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = window.setTimeout(async () => {
      const term = q.trim();

      // prázdne vyhľadávanie → znovu načítaj základný zoznam s filtrami
      if (!term) {
        try {
          setSearching(true);
          setError(null);
          const params = new URLSearchParams({
            page: "1",
            page_size: "50",
            sort: sortOption,
          });
          if (roleFilter !== "all") params.set("role", roleFilter);
          const res = await fetch(`/api/users?${params.toString()}`);
          const data: UsersApiResp = await res.json();
          const items = (Array.isArray(data) ? data : data.items) ?? [];
          setUsers(items);
        } catch {
          // necháme pôvodný stav, ak reload zlyhá
        } finally {
          setSearching(false);
        }
        return;
      }

      // ne-prázdny dotaz → voláme /api/users?q=... (sentence embedding search)
      try {
        setSearching(true);
        setError(null);

        const params = new URLSearchParams({
          q: term,
          page: "1",
          page_size: "50",
          sort: sortOption,
        });
        if (roleFilter !== "all") params.set("role", roleFilter);

        const res = await fetch(`/api/users?${params.toString()}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Chyba pri vyhľadávaní.");
        }
        const data: UsersApiResp = await res.json();
        const items = (Array.isArray(data) ? data : data.items) ?? [];
        setUsers(items);
      } catch (e: any) {
        setError(e.message || "Chyba pri vyhľadávaní.");
        setUsers([]);
      } finally {
        setSearching(false);
      }
    }, 250) as unknown as number;

    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, [q, isMatchMode, roleFilter, sortOption]);

  // načítanie avatarov pre používateľov, ktorí ich ešte nemajú v cache
  useEffect(() => {
    const missing = users.filter((u) => avatars[u.id_user] === undefined);
    if (!missing.length) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        missing.map(async (u) => {
          try {
            const res = await fetch(`${baseUrl}/api/profile/${u.id_user}/avatar`);
            if (!res.ok) return [u.id_user, null] as const;
            const data = await res.json();
            const url = data?.url ? `${baseUrl}${data.url}` : null;
            return [u.id_user, url] as const;
          } catch {
            return [u.id_user, null] as const;
          }
        })
      );
      if (cancelled) return;
      setAvatars((prev) => {
        const next = { ...prev };
        results.forEach(([id, url]) => {
          next[id] = url;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [users, avatars, baseUrl]);

  // render avataru
  const renderAvatar = (user: User) => {
    const url = avatars[user.id_user];
    if (url) {
      return (
        <img
          src={url}
          alt={`${user.meno} ${user.priezvisko}`}
          className="w-full h-full object-cover"
        />
      );
    }
    const initials = `${user.meno?.[0] ?? ""}${user.priezvisko?.[0] ?? ""}`
      .trim()
      .toUpperCase();
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-lg font-semibold">
        {initials || "?"}
      </div>
    );
  };

  const renderRatingInfo = (user: User) => {
    const hasRating =
      typeof user.avg_rating === "number" &&
      (user.rating_count ?? 0) > 0;

    if (!hasRating) {
      return (
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Bez hodnotenia
        </span>
      );
    }

    return (
      <div className="flex items-center gap-1 text-sm text-yellow-500 dark:text-yellow-400">
        <span aria-hidden="true">{"\u2605"}</span>
        <span className="font-semibold">
          {(user.avg_rating ?? 0).toFixed(1)}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          ({user.rating_count})
        </span>
      </div>
    );
  };

  // filter kto koho vidí (admin vs bežný používateľ)
  const visibleUsers = useMemo(() => {
    return users.filter((u) => {
      if (!currentUser) {
        if (u.rola === "admin") return false;
        if (u.id_user === 1) return false;
        return true;
      }

      if (isAdmin) return true;

      if (u.rola === "admin") return false;
      if (u.id_user === 1) return false;

      // sám seba vidí – takže žiadny filter na currentUserId
      return true;
    });
  }, [users, currentUser, isAdmin]);

  // mazanie používateľa – len admin
  const handleDeleteUser = async (id: number) => {
    if (!isAdmin) return;
    if (!window.confirm("Naozaj chceš zmazať tento profil?")) return;

    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "Mazanie zlyhalo.");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id_user !== id));
    } catch {
      alert("Chyba siete pri mazaní používateľa.");
    }
  };

  // ---------------- UI ----------------

  const header = (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">
            {isMatchMode ? "Odporúčané profily podľa záľub" : "Používatelia"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isMatchMode
              ? matchUserId
                ? `Zobrazujú sa profily s najpodobnejšími záľubami k účtu #${matchUserId}.`
                : "Zobrazujú sa profily s najpodobnejšími záľubami."
              : "Objav ľudí z komunity LifeBridge."}
          </p>
        </div>
      </div>

      {!isMatchMode && (
        <div className="mt-4 space-y-3">
          {/* vyhľadávanie */}
          <div className="relative">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadaj meno, priezvisko alebo e-mail"
              className="w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-900 dark:border-gray-700"
              aria-label="Vyhľadávanie používateľov"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              ?
            </span>
          </div>

          {/* filter + sort */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full border rounded-2xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700"
                aria-label="Filter role"
              >
                {ROLE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="w-full border rounded-2xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700"
                aria-label="Triedenie"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 mt-1">
        {isMatchMode ? (
          <>Nájdené odporúčania: {visibleUsers.length}</>
        ) : q.trim() ? (
          searching ? (
            <>Hľadám…</>
          ) : (
            <>Výsledky: {visibleUsers.length}</>
          )
        ) : (
          <>Počet používateľov: {visibleUsers.length}</>
        )}
      </div>
    </div>
  );

  const listContent = () => {
    if (error)
      return <p className="text-center text-red-500">{error}</p>;
    if (loading)
      return (
        <p className="text-center text-gray-500">
          Načítavam používateľov…
        </p>
      );
    if (visibleUsers.length === 0) {
      return (
        <p className="text-center text-gray-500 dark:text-gray-400">
          {isMatchMode
            ? "Žiadne vhodné odporúčania."
            : q.trim()
            ? "Nenašli sa žiadni používatelia."
            : "Zatiaľ žiadni používatelia."}
        </p>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleUsers.map((user) => (
          <div
            key={user.id_user}
            className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-md p-5 flex flex-col gap-4 cursor-pointer hover:shadow-lg transition group"
            onClick={() => navigate(`/user/${user.id_user}`)}
            title="Zobraziť profil používateľa"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-indigo-100 dark:ring-indigo-900 bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                {renderAvatar(user)}
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] sm:max-w-[220px]">
                  {user.meno} {user.priezvisko}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {user.mail}
                </p>
                <span className="inline-flex mt-1 -ml-1 items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
                  {roleLabel(user.rola)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {renderRatingInfo(user)}
              {typeof user.similarity_percent === "number" && (
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  Zhoda záľub: {user.similarity_percent}%
                </span>
              )}
            </div>

            {/* Admin akcie */}
            {isAdmin && (
              <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/user/${user.id_user}`);
                  }}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-2 py-1 rounded-md"
                >
                  Upraviť
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteUser(user.id_user);
                  }}
                  className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded-md"
                >
                  Zmazať
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-8">
        {header}
        {listContent()}
      </div>
    </MainLayout>
  );
}
