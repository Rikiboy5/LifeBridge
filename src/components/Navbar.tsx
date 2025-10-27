import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const location = useLocation();

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <nav className="flex items-center justify-between px-6 py-3 bg-gray-100 dark:bg-gray-900 shadow-md transition-colors">
      {/* Logo */}
      <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
        LifeBridge
      </h1>

      {/* Stredná sekcia: navigácia + vyhľadávanie */}
      <div className="flex items-center gap-6 flex-1 justify-center max-w-3xl">
        {/* Odkazy */}
        <div className="flex gap-6">
          <Link
            to="/"
            className={`font-medium transition ${
              location.pathname === "/"
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400"
            }`}
          >
            Domov
          </Link>
          <Link
            to="/profil"
            className={`font-medium transition ${
              location.pathname === "/profil"
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400"
            }`}
          >
            Profil
          </Link>
          <Link
  to="/users"
  className="text-gray-800 dark:text-gray-200 font-medium hover:text-blue-600 dark:hover:text-blue-400 transition"
>
  Používatelia
</Link>
        </div>

        {/* Vyhľadávanie */}
        <div className="hidden sm:flex items-center bg-gray-200 dark:bg-gray-800 rounded-lg px-3 py-1 w-60">
          <input
            type="text"
            placeholder="Hľadať…"
            className="bg-transparent w-full text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none"
          />
          <span className="text-gray-500 dark:text-gray-400 ml-2">🔍</span>
        </div>
      </div>

      {/* Prepínač témy */}
      <button
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        className="p-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 transition"
      >
        {theme === "light" ? "🌙" : "☀️"}
      </button>
            

    </nav>
  );
}
