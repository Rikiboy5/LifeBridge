import React, { useEffect, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";

interface User {
  id_user: number;
  meno: string;
  priezvisko: string;
  mail: string;
}

type UsersApiResp =
  | User[] // keď BE vráti čisté pole (bez q)
  | { items: User[]; pagination?: { page: number; page_size: number; total: number; pages: number } };

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const tRef = useRef<number | null>(null);

  // prvé načítanie
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/users");
        if (!res.ok) throw new Error("Nepodarilo sa načítať používateľov");
        const data: UsersApiResp = await res.json();
        const items = Array.isArray(data) ? data : data.items;
        setUsers(items ?? []);
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
        // keď sa pole vymaže -> načítaj default
        try {
          setSearching(true);
          const res = await fetch("/api/users");
          const data: UsersApiResp = await res.json();
          const items = Array.isArray(data) ? data : data.items;
          setUsers(items ?? []);
        } catch {
          // ignoruj
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
        const items = Array.isArray(data) ? data : data.items;
        setUsers(items ?? []);
      } catch (e: any) {
        setError(e.message || "Chyba pri vyhľadávaní");
        setUsers([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => { if (tRef.current) window.clearTimeout(tRef.current); };
  }, [q]);

  if (loading) return <p className="text-center mt-10">Načítavam používateľov...</p>;
  if (error) return <p className="text-center mt-10 text-red-500">{error}</p>;

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto mt-10 bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
        <h2 className="text-2xl font-bold mb-4 text-center">Používatelia</h2>

        <div className="flex items-center gap-2 mb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hľadaj meno, priezvisko alebo e-mail…"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Vyhľadávanie používateľov"
          />
        </div>

        <div className="text-xs text-gray-500 mb-2">
          {q.trim()
            ? searching ? "Hľadám…" : `Výsledky: ${users.length}`
            : `Počet používateľov: ${users.length}`}
        </div>

        {users.length === 0 ? (
          <p className="text-gray-500 text-center">
            {q.trim() ? "Nenašli sa žiadni používatelia." : "Zatiaľ žiadni používatelia."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-300 dark:divide-gray-700">
            {users.map((u) => (
              <li key={u.id_user} className="py-3 flex justify-between items-center">
                <div>
                  <p className="font-semibold">{u.meno} {u.priezvisko}</p>
                  <p className="text-sm text-gray-500">{u.mail}</p>
                </div>
                <span className="text-gray-400 text-sm">ID: {u.id_user}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MainLayout>
  );
}
