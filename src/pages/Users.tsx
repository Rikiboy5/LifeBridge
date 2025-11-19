import React, { useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import { useLocation, useNavigate } from "react-router-dom";

interface User {
  id_user: number;
  meno: string;
  priezvisko: string;
  mail: string;
  rola?: string;
  similarity?: number;
  similarity_percent?: number;
}

type UsersApiResp =
  | User[]
  | {
      items: User[];
      pagination?: { page: number; page_size: number; total: number; pages: number };
    };

export default function Users() {
  const navigate = useNavigate();
  const location = useLocation();
  const matchUserId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("matchFor");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);

  const isMatchMode = matchUserId !== null;

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const tRef = useRef<number | null>(null);

  useEffect(() => {
    if (isMatchMode) setQ("");
  }, [isMatchMode]);

  useEffect(() => {
    let cancelled = false;

    const fetchList = async () => {
      setLoading(true);
      setError(null);
      try {
        const endpoint =
          isMatchMode && matchUserId
            ? `/api/match/${matchUserId}?top_n=20`
            : "/api/users";
        const res = await fetch(endpoint);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Nepodarilo sa načítať používateľov");
        }
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.items;
        if (!cancelled) setUsers(items ?? []);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Chyba načítania");
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchList();
    return () => {
      cancelled = true;
    };
  }, [isMatchMode, matchUserId]);

  useEffect(() => {
    if (isMatchMode) return;

    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(async () => {
      const term = q.trim();
      if (!term) {
        try {
          setSearching(true);
          const res = await fetch("/api/users");
          const data: UsersApiResp = await res.json();
          const items = Array.isArray(data) ? data : data.items;
          setUsers(items ?? []);
        } catch {
          // ignore reload failure
        } finally {
          setSearching(false);
        }
        return;
      }

      try {
        setSearching(true);
        setError(null);
        const qs = new URLSearchParams({
          q: term,
          page: "1",
          page_size: "50",
          sort: "name_asc",
        });
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

    return () => {
      if (tRef.current) window.clearTimeout(tRef.current);
    };
  }, [q, isMatchMode]);

  if (loading) return <p className="text-center mt-10">Načítavam používateľov...</p>;
  if (error) return <p className="text-center mt-10 text-red-500">{error}</p>;

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto mt-10 bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
        <h2 className="text-2xl font-bold mb-2 text-center">
          {isMatchMode
            ? `Odporúčania na základe záľub pre používateľa ${matchUserId}`
            : "Používatelia"}
        </h2>

        {isMatchMode && (
          <p className="text-center text-sm text-gray-500 mb-4">
            Zobrazujú sa profily s najpodobnejšími záľubami podľa vybraného účtu.
          </p>
        )}

        {!isMatchMode && (
          <div className="flex items-center gap-2 mb-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadaj meno, priezvisko alebo e-mail"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Vyhľadávanie používateľov"
            />
          </div>
        )}

        <div className="text-xs text-gray-500 mb-2">
          {isMatchMode
            ? `Nájdené odporúčania: ${users.length}`
            : q.trim()
            ? searching
              ? "Hľadám..."
              : `Výsledky: ${users.length}`
            : `Počet používateľov: ${users.length}`}
        </div>

        {users.length === 0 ? (
          <p className="text-gray-500 text-center">
            {isMatchMode
              ? "Nenašli sa žiadne odporúčania podľa záľub."
              : q.trim()
              ? "Nenašli sa žiadni používatelia."
              : "Zatiaľ žiadni používatelia."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-300 dark:divide-gray-700">
            {users.map((u) => (
              <li
                key={u.id_user}
                className="py-3 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-2 rounded-md"
                onClick={() => navigate(`/user/${u.id_user}`)}
                title="Zobraziť profil"
              >
                <div>
                  <p className="font-semibold">
                    {u.meno} {u.priezvisko}
                  </p>
                  <p className="text-sm text-gray-500">{u.mail}</p>
                  {typeof u.similarity_percent === "number" && (
                    <p className="text-sm font-semibold text-blue-600">
                      Zhoda záľub: {u.similarity_percent}%
                    </p>
                  )}
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
