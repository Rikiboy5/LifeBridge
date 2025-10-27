import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function Navbar() {
  const [user, setUser] = useState<{ meno: string; priezvisko: string } | null>(null);

  useEffect(() => {
    const u = localStorage.getItem("user");
    if (u) setUser(JSON.parse(u));
  }, []);

  return (
    <nav className="flex justify-between items-center p-4 bg-white dark:bg-gray-900 shadow">
      <Link to="/" className="text-2xl font-bold text-blue-600">LifeBridge</Link>
      <div className="flex space-x-4">
        <Link to="/">Domov</Link>
        <Link to="/users">Používatelia</Link>
        {user ? (
          <Link to="/profil" className="text-blue-600 font-semibold">
            {user.meno} {user.priezvisko}
          </Link>
        ) : (
          <>
            <Link to="/login">Prihlásenie</Link>
            <Link to="/register">Registrácia</Link>
          </>
        )}
      </div>
    </nav>
  );
}
