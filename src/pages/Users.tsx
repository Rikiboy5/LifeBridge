import React, { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";


interface User {
  id_user: number;
  meno: string;
  priezvisko: string;
  mail: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch("/api/users"); // 🔥 Vite proxy pošle toto na Flask (127.0.0.1:5000/api/users)
        if (!res.ok) throw new Error("Nepodarilo sa načítať používateľov");
        const data = await res.json();
        setUsers(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  if (loading) return <p className="text-center mt-10">Načítavam používateľov...</p>;
  if (error) return <p className="text-center mt-10 text-red-500">{error}</p>;

  return (
        <MainLayout>
    
    <div className="max-w-2xl mx-auto mt-10 bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
      <h2 className="text-2xl font-bold mb-4 text-center">Používatelia</h2>
      {users.length === 0 ? (
        <p className="text-gray-500 text-center">Zatiaľ žiadni používatelia.</p>
      ) : (
        <ul className="divide-y divide-gray-3 00 dark:divide-gray-700">
          {users.map((u) => (
            <li key={u.id_user} className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold">{u.meno}</p>
                <p className="font-semibold">{u.priezvisko}</p>

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
