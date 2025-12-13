import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react"; // máš už v projekte
import { type Theme, applyTheme, getPreferredTheme } from "../theme";

type Props = {
  className?: string;
};

export default function ThemeToggle({ className = "" }: Props) {
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());

  useEffect(() => {
    // pri mount-e a pri každej zmene aplikuj tému globálne
    applyTheme(theme);
  }, [theme]);

  const toggle = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Prepnúť na svetlý režim" : "Prepnúť na tmavý režim"}
      className={`inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white/80 dark:bg-gray-900/80 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition ${className}`}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      <span className="hidden sm:inline">
        {isDark ? "Svetlý režim" : "Tmavý režim"}
      </span>
    </button>
  );
}