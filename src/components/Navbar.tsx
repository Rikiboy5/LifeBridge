import React, { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useChat } from "../components/ChatContext";

type NavUser = { name: string; surname: string; role?: string };

export default function Navbar() {
  const [user, setUser] = useState<NavUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  // Auto-close nav pri routingu
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const { resetChat } = useChat();
  const handleLogout = () => {
    resetChat();
    localStorage.removeItem("user");
    setUser(null);
    navigate("/");
  };

  return (
    <nav className="bg-white dark:bg-gray-900 shadow-md fixed top-0 left-0 right-0 z-40">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        {/* Logo a menu */}
        <div className="flex items-center">
          <Link
            to="/"
            className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 tracking-widest mr-6"
          >
            LifeBridge
          </Link>
          {/* Desktop menu */}
          <div className="hidden md:flex gap-4 items-center">
            <NavLinks user={user} />
          </div>
        </div>
        {/* Užívateľ/Logout (desktop) */}
        <div className="hidden md:flex items-center space-x-4">
          {user ? (
            <>
              <span className="text-gray-700 dark:text-gray-200 select-none">
                👋 {user.name} {user.surname}
              </span>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-3 py-1 rounded-md hover:bg-red-700 transition"
              >
                Odhlásiť
              </button>
            </>
          ) : null}
        </div>
        {/* Hamburger button (mobile) */}
        <button
          className="md:hidden flex items-center px-2 py-1 focus:outline-none group"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Zavrieť menu" : "Otvoriť menu"}
        >
          <div className="flex flex-col justify-center w-7 h-7">
            <span
              className={`block h-1 w-7 rounded transition bg-blue-600 dark:bg-blue-400 duration-300 ${
                menuOpen ? "rotate-45 translate-y-2" : ""
              }`}
            ></span>
            <span
              className={`block h-1 w-7 rounded mt-1 transition bg-blue-600 dark:bg-blue-400 duration-300 ${
                menuOpen ? "opacity-0" : ""
              }`}
            ></span>
            <span
              className={`block h-1 w-7 rounded mt-1 transition bg-blue-600 dark:bg-blue-400 duration-300 ${
                menuOpen ? "-rotate-45 -translate-y-2" : ""
              }`}
            ></span>
          </div>
        </button>
      </div>
      {/* Mobile slide-down menu */}
      <div
        className={`md:hidden transition-all duration-300 overflow-hidden bg-white dark:bg-gray-900 shadow-lg border-t border-gray-100 dark:border-gray-800 ${
          menuOpen ? "max-h-[450px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="flex flex-col px-4 pt-2 pb-4 gap-2">
          <NavLinks user={user} onClick={() => setMenuOpen(false)} />
          {user ? (
            <div className="flex items-center gap-3 mt-4">
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
          ) : null}
        </div>
      </div>
    </nav>
  );
}

// Mení farbu linku podľa route (môžeš upraviť podľa aktuálneho routingu)
function NavLinks({
  user,
  onClick,
}: {
  user: NavUser | null;
  onClick?: () => void;
}) {
  return (
    <>
      <NavLinkItem to="/" label="Domov" onClick={onClick} />
      <NavLinkItem to="/users" label="Používatelia" onClick={onClick} />
      <NavLinkItem to="/posts" label="Príspevky" onClick={onClick} />
      {user && <NavLinkItem to="/profil" label="Profil" onClick={onClick} />}
      {!user && (
        <>
          <NavLinkItem to="/login" label="Prihlásenie" onClick={onClick} />
          <NavLinkItem to="/register" label="Registrácia" onClick={onClick} />
        </>
      )}
    </>
  );
}

function NavLinkItem({
  to,
  label,
  onClick,
}: {
  to: string;
  label: string;
  onClick?: () => void;
}) {
  const location = useLocation();
  const active =
    location.pathname === to ||
    (to !== "/" && location.pathname.startsWith(to));
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`block py-1 px-3 rounded transition font-semibold ${
        active
          ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400"
          : "text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-800 hover:text-blue-700"
      }`}
    >
      {label}
    </Link>
  );
}
