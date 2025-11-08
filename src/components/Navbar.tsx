import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Navbar() {
  const [user, setUser] = useState<{ name: string; surname: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    setUser(null);
    navigate("/");
  };

  return (
    <nav className="bg-white dark:bg-gray-900 shadow-md py-3 px-6 flex justify-between items-center">
      <div className="flex items-center space-x-6">
        <Link to="/" className="text-xl font-bold text-blue-600 dark:text-blue-400">
          LifeBridge
        </Link>
        <Link
          to="/"
          className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition"
        >
          Domov
        </Link>
                <Link
          to="/users"
          className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition"
        >
          Používatelia
        </Link>
        {user && (
          <Link
            to="/profil"
            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition"
          >
            Profil
          </Link>
        )}
        
        {!user && (
          <>
            <Link
              to="/login"
              className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition"
            >
              Prihlásenie
            </Link>
            <Link
              to="/register"
              className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition"
            >
              Registrácia
            </Link>
          </>
        )}
            <Link
            to="/posts"
            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition"
            >
              Príspevky
            </Link>
           
      </div>

      {user && (
        <div className="flex items-center space-x-4">
          <span className="text-gray-700 dark:text-gray-200">
            👋 {user.name} {user.surname}
          </span>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-3 py-1 rounded-md hover:bg-red-700 transition"
          >
            Odhlásiť
          </button>
        </div>
      )}
    </nav>
  );
}
