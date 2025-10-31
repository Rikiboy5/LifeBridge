import React from "react";

export default function Footer() {
  return (
    <footer className="mt-16 bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 py-6 border-t border-gray-300 dark:border-gray-700">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0">
        {/* 👣 Ľavá strana */}
        <p className="text-sm">
          © {new Date().getFullYear()} <span className="font-semibold text-blue-600 dark:text-blue-400">LifeBridge</span>.  
          Všetky práva vyhradené.
        </p>

        {/* 🔗 Pravá strana */}
        <div className="flex space-x-4 text-sm">
          <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition">O projekte</a>
          <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition">Kontakt</a>
          <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition">Podmienky</a>
        </div>
      </div>
    </footer>
  );
}
