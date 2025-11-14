import React, { useEffect, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import { useNavigate } from "react-router-dom";

interface User {
  id_user: number;
  meno: string;
  priezvisko: string;
  mail: string;
  rola?: string;
}

type UsersApiResp =
  | User[]
  | {
      items: User[];
      pagination?: {
        page: number;
        page_size: number;
        total: number;
        pages: number;
      };
    };

type CurrentUser = {
  id?: number;
  id_user?: number;
  name: string;
  surname: string;
  role?: string;
};

export default function Users() {
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const debounceRef = useRef<number | null>(null);

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

  // 🔹 prvé načítanie
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/users");
      const data: UsersApiResp = await res.json();
      const items = Array.isArray(data) ? data : data.items;
      setUsers(items ?? []);
    } catch (err: any) {
      setError(err.message ?? "Chyba načítania");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // 🔹 vyhľadávanie
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      const term = q.trim();

      if (!term) {
        await fetchUsers();
        return;
      }

      try {
        setSearching(true);
        const qs = new URLSearchParams({
          q: term,
          page: "1",
          page_size: "50",
          sort: "name_asc",
        });

        const res = await fetch(`/api/users?${qs}`);
        const data: UsersApiResp = await res.json();
        const items = Array.isArray(data) ? data : data.items;

        setUsers(items ?? []);
      } catch (err: any) {
        setError(err.message || "Chyba pri vyhľadávaní");
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q]);

  // 🔥 filtrovanie:
  const visibleUsers = users.filter((u) => {
    if (!currentUser) {
      if (u.rola === "admin") return false;
      if (u.id_user === 1) return false;
      return true;
    }

    if (isAdmin) return true;

    if (u.rola === "admin") return false;
    if (u.id_user === 1) return false;
    //if (u.id_user === currentUserId) return false; -- toto zaistí, že sa konkrétne prihlásený user neuvidí v zozname

    return true;
  });

  // 🔥 delete user
  const handleDeleteUser = async (id: number) => {
    if (!isAdmin) return;
    if (!window.confirm("Naozaj chceš zmazať tento profil?")) return;

    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Mazanie zlyhalo.");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id_user !== id));
    } catch {
      alert("Chyba siete pri mazaní.");
    }
  };

  // ------------------------------------------------------------------

  if (loading) {
    return (
      <MainLayout>
        <p className="text-center mt-10">Načítavam používateľov…</p>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <p className="text-center text-red-500 mt-10">{error}</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto mt-10 bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
        <h2 className="text-2xl font-bold mb-4 text-center">Používatelia</h2>

        {/* 🔎 Vyhľadávanie */}
        <div className="flex items-center gap-2 mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hľadaj meno / priezvisko / email…"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="text-xs text-gray-500 mb-4">
          {q.trim()
            ? searching
              ? "Hľadám…"
              : `Výsledky: ${visibleUsers.length}`
            : `Počet používateľov: ${visibleUsers.length}`}
        </div>

        {/* 🧑‍🤝‍🧑 Zoznam */}
        {visibleUsers.length === 0 ? (
          <p className="text-center text-gray-500">
            {q ? "Nenašli sa žiadni používatelia." : "Zatiaľ žiadni používatelia."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-300 dark:divide-gray-700">
            {visibleUsers.map((u) => (
              <li
                key={u.id_user}
                className="py-3 px-2 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md group cursor-pointer"
                onClick={() => navigate(`/user/${u.id_user}`)}
              >
                {/* Info */}
                <div>
                  <p className="font-semibold">
                    {u.meno} {u.priezvisko}
                  </p>
                  <p className="text-sm text-gray-500">{u.mail}</p>
                </div>

                {/* Akcie pre admina */}
                {isAdmin && (
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/user/${u.id_user}`); // 👈 EDIT PROFIL
                      }}
                      className="text-yellow-600 hover:text-yellow-800 text-sm underline"
                    >
                      Upraviť
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteUser(u.id_user);
                      }}
                      className="text-red-600 hover:text-red-800 text-sm underline"
                    >
                      Zmazať
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </MainLayout>
  );
}