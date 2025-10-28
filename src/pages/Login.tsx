import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (!email || !password) {
      setMessage("Vyplň email aj heslo.");
      return;
    }

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Prihlásenie zlyhalo.");

      // uložíme prihláseného používateľa
      localStorage.setItem("user", JSON.stringify(data.user));

      setMessage(`Vitaj späť, ${data.user.name}! 👋`);
      setTimeout(() => navigate("/"), 1000);
    } catch (err: any) {
      setMessage("❌ " + err.message);
    }
  };

  return (
    <MainLayout>
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-900 shadow-xl rounded-2xl p-8 w-full max-w-md text-gray-800 dark:text-gray-100 space-y-4"
      >
        <h2 className="text-2xl font-bold text-center text-blue-700 dark:text-blue-400">
          Prihlásenie
        </h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none"
        />
        <input
          type="password"
          placeholder="Heslo"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none"
        />

        <button
          type="submit"
          className="w-full mt-4 bg-blue-600 text-white font-semibold p-2 rounded-md hover:bg-blue-700 transition"
        >
          Prihlásiť sa
        </button>

        {message && (
          <p
            className={`text-center mt-3 text-sm ${
              message.startsWith("Vitaj") ? "text-green-600" : "text-red-500"
            }`}
          >
            {message}
          </p>
        )}
      </form>
    </div>
    </MainLayout>
  );
}
