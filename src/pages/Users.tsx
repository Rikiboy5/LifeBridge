import React, { useEffect, useRef, useState } from "react";
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
  | User[] // keď BE vráti čisté pole (bez q)
  | { items: User[]; pagination?: { page: number; page_size: number; total: number; pages: number } };

const ROLE_LABELS: Record<string, string> = {
  user_dobrovolnik: "Dobrovoľník",
  user_firma: "Firma",
  user_senior: "Dôchodca",
};

const roleLabel = (role?: string | null) => ROLE_LABELS[role ?? ""] || "Používateľ";

export default function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [avatars, setAvatars] = useState<Record<number, string | null>>({});

  const baseUrl = (import.meta as any).env?.VITE_API_URL ?? "http://127.0.0.1:5000";
  const tRef = useRef<number | null>(null);

  const extractItems = (data: UsersApiResp) => (Array.isArray(data) ? data : data.items) ?? [];

  // prvé načítanie
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/users");
        if (!res.ok) throw new Error("Nepodarilo sa načítať používateľov");
        const data: UsersApiResp = await res.json();
        setUsers(extractItems(data));
        setError(null);
      } catch (err: any) {
        setError(err.message || "Chyba načítania");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // vyhľadávanie s debounce
  useEffect(() => {
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(async () => {
      const term = q.trim();
      if (!term) {
        try {
          setSearching(true);
          const res = await fetch("/api/users");
          if (!res.ok) throw new Error("Nepodarilo sa načítať používateľov");
          const data: UsersApiResp = await res.json();
          setUsers(extractItems(data));
        } catch (e: any) {
          setError(e.message || "Chyba načítania");
        } finally {
          setSearching(false);
        }
        return;
      }
      try {
        setSearching(true);
        setError(null);
        const qs = new URLSearchParams({ q: term, page: "1", page_size: "50", sort: "name_asc" });
        const res = await fetch(`/api/users?${qs.toString()}`);
        if (!res.ok) throw new Error(await res.text());
        const data: UsersApiResp = await res.json();
        setUsers(extractItems(data));
      } catch (e: any) {
        setError(e.message || "Chyba pri vyhľadávaní");
        setUsers([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => { if (tRef.current) window.clearTimeout(tRef.current); };
  }, [q]);

  // dotiahni avatary pre práve zobrazených používateľov
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
            return [u.id_user, data?.url ? `${baseUrl}${data.url}` : null] as const;
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

    return () => { cancelled = true; };
  }, [users, avatars, baseUrl]);

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
    const initials = `${user.meno?.[0] ?? ""}${user.priezvisko?.[0] ?? ""}`.trim().toUpperCase();
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-lg font-semibold">
        {initials || "?"}
      </div>
    );
  };

  const renderRatingInfo = (user: User) => {
    const hasRating = typeof user.avg_rating === "number" && (user.rating_count ?? 0) > 0;
    if (!hasRating) {
      return <span className="text-xs text-gray-400 dark:text-gray-500">Bez hodnotenia</span>;
    }
    const ratingValue = (user.avg_rating ?? 0).toFixed(1);
    return (
      <div className="flex items-center gap-1 text-sm text-yellow-500 dark:text-yellow-400">
        <span aria-hidden="true">★</span>
        <span className="font-semibold">{ratingValue}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">({user.rating_count})</span>
      </div>
    );
  };

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
      <div className="mt-4">
        <div className="relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hľadaj meno, priezvisko alebo e-mail…"
            className="w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-900 dark:border-gray-700"
            aria-label="Vyhľadávanie používateľov"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">⌕</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {q.trim()
            ? (searching ? "Hľadám…" : `Výsledky: ${users.length}`)
            : `Počet používateľov: ${users.length}`}
        </div>
      </div>
    </div>
  );

  const listContent = () => {
    if (error) return <p className="text-center text-red-500">{error}</p>;
    if (loading) return <p className="text-center text-gray-500">Načítavam používateľov…</p>;
    if (users.length === 0) {
      return (
        <p className="text-center text-gray-500 dark:text-gray-400">
          {q.trim() ? "Nenašli sa žiadni používatelia." : "Zatiaľ žiadni používatelia."}
        </p>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user) => (
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
                <p className="text-sm text-gray-500 dark:text-gray-400">{user.mail}</p>
                <span className="inline-flex mt-1 -ml-1 items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
                  {roleLabel(user.rola)}
                </span>
              </div>
            </div>
            <div>
              {renderRatingInfo(user)}
            </div>
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
