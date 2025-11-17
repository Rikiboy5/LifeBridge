import React, { useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import { useNavigate } from "react-router-dom";

interface User {
  id_user: number;
  meno: string;
  priezvisko: string;
  mail: string;
  rola?: string;
  avg_rating?: number | null;
  rating_count?: number | null;
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

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortOption, setSortOption] = useState("id_desc");
  const [avatars, setAvatars] = useState<Record<number, string | null>>({});

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const baseUrl =
    (import.meta as any).env?.VITE_API_URL ?? "http://127.0.0.1:5000";
  const initialFetchRef = useRef(false);

  // načítanie prihláseného používateľa
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch {
      setCurrentUser(null);
    }
  }, []);

  const currentUserId = currentUser?.id ?? currentUser?.id_user ?? null;
  const isAdmin = currentUser?.role === "admin" || currentUserId === 1;

  // debounce pre vyhľadávanie
  useEffect(() => {
    const handler = window.setTimeout(() => {
      setDebouncedQuery(q.trim().toLowerCase());
    }, 250);
    return () => window.clearTimeout(handler);
  }, [q]);

  // načítanie používateľov (podľa role + sort)
  useEffect(() => {
    const fetchUsers = async () => {
      const isInitial = !initialFetchRef.current;

      if (isInitial) {
        setLoading(true);
      } else {
        setSearching(true);
      }

      try {
        const params = new URLSearchParams({
          page: "1",
          page_size: "50",
          sort: sortOption,
        });
        if (roleFilter !== "all") {
          params.set("role", roleFilter);
        }

        const res = await fetch(`/api/users?${params.toString()}`);
        if (!res.ok) throw new Error(await res.text());
        const data: UsersApiResp = await res.json();
        const items = (Array.isArray(data) ? data : data.items) ?? [];
        setUsers(items);
        setError(null);
      } catch (e: any) {
        setError(e.message || "Chyba načítania používateľov.");
        setUsers([]);
      } finally {
        if (!initialFetchRef.current) {
          // prvé načítanie
          initialFetchRef.current = true;
          setLoading(false);
        } else {
          // ďalšie vyhľadávania / filtrovania
          setSearching(false);
        }
      }
    };

    fetchUsers();
  }, [roleFilter, sortOption]);

  // načítanie avatarov
  useEffect(() => {
    const missing = users.filter((u) => avatars[u.id_user] === undefined);
    if (!missing.length) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        missing.map(async (u) => {
          try {
            const res = await fetch(
              `${baseUrl}/api/profile/${u.id_user}/avatar`
            );
            if (!res.ok) return [u.id_user, null] as const;
            const data = await res.json();
            return [
              u.id_user,
              data?.url ? `${baseUrl}${data.url}` : null,
            ] as const;
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
    const initials = `${user.meno?.[0] ?? ""}${
      user.priezvisko?.[0] ?? ""
    }`
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

  // client-side vyhľadávanie
  const filteredUsers = useMemo(() => {
    const term = debouncedQuery;
    if (!term) return users;
    return users.filter((user) => {
      const full = `${user.meno ?? ""} ${user.priezvisko ?? ""}`.toLowerCase();
      const first = (user.meno ?? "").toLowerCase();
      const last = (user.priezvisko ?? "").toLowerCase();
      const email = (user.mail ?? "").toLowerCase();
      return (
        full.includes(term) ||
        first.includes(term) ||
        last.includes(term) ||
        email.includes(term)
      );
    });
  }, [users, debouncedQuery]);

  // ďalší filter – kto koho vidí (admin vs. bežný user)
  const visibleUsers = useMemo(() => {
    return filteredUsers.filter((u) => {
      // Neprihlásený – nevidí adminov ani systémového usera 1
      if (!currentUser) {
        if (u.rola === "admin") return false;
        if (u.id_user === 1) return false;
        return true;
      }

      // Admin vidí všetkých
      if (isAdmin) return true;

      // Bežný používateľ:
      if (u.rola === "admin") return false; // nevidí adminov
      if (u.id_user === 1) return false; // nevidí systémového usera 1
      // Sám seba naopak vidí – takže tu NEmáme filter na currentUserId
      return true;
    });
  }, [filteredUsers, currentUser, isAdmin]);

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
          <h1 className="text-3xl font-bold">Používatelia</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Objav ľudí z komunity LifeBridge.
          </p>
        </div>
      </div>

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

      <div className="text-xs text-gray-500 mt-1">
        {q.trim()
          ? searching
            ? "Hľadám…"
            : `Výsledky: ${visibleUsers.length}`
          : `Počet používateľov: ${visibleUsers.length}`}
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
          {q.trim()
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
              <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-indigo-100 dark:ring-indigo-900 bg-gray-100 dark:bg-gray-700">
                {renderAvatar(user)}
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
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

            <div>{renderRatingInfo(user)}</div>

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