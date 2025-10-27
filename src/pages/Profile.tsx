import React, { useState } from "react";
import ManImage from "../assets/img/teen.jpg";
import CardCreator from "../components/CardCreator"; 
import Card from "../components/Card";
import MainLayout from "../layouts/MainLayout";


export default function Profile() {
  const [isCreating, setIsCreating] = useState(false); 

  return (
    <MainLayout>
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100">
      <div className="max-w-4xl mx-auto p-8">
        {/* Profilová hlavička */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-8 flex flex-col items-center text-center space-y-4">
          <img
            src={ManImage}
            alt="Profilová fotka"
            className="w-32 h-32 rounded-full object-cover border-4 border-blue-600 dark:border-indigo-400 shadow"
          />
          <h2 className="text-2xl font-bold">Ján Novák</h2>
          <p className="text-gray-600 dark:text-gray-300 max-w-md">
            Dobrovoľník, ktorý rád pomáha seniorom s technológiami, nákupmi a
            záhradou 🌿
          </p>
          <button className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition">
            Upraviť profil
          </button>
        </div>

        {/* Sekcia s informáciami */}
        <div className="mt-10 grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-3">Základné údaje</h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>📍 Bratislava, Slovensko</li>
              <li>🎂 27 rokov</li>
              <li>💼 5 dobrovoľníckych aktivít</li>
            </ul>
          </div>

          <div className="bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-3">O mne</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Som zvedavý, spoločenský a rád pomáham ľuďom. V poslednom čase sa
              venujem učeniu seniorov základom práce s telefónmi a počítačmi 💻.
            </p>
          </div>
        </div>
        <div className="mt-10">
          <Card
  title="Pomoc so záhradou"
  description="Pomôžem s jarným upratovaním dvora, trávnika a výsadbou rastlín 🌱"
  image="/img/garden.jpg"
  author="Ján Novák"
  location="Bratislava"
  category="Dobrovoľníctvo"
/>
        </div>
        {/* Miesto pre budúce karty */}
        <div className="mt-10 bg-white dark:bg-gray-800 rounded-2xl shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Moje ponuky</h3>
          <p className="text-gray-500 dark:text-gray-400 italic">
            Zatiaľ si nevytvoril žiadnu ponuku. V budúcnosti tu uvidíš svoje
            karty (práce, pomoc, služby...).
          </p>

          {/* 🔹 Tlačidlo na otvorenie modalu */}
          <button
            onClick={() => setIsCreating(true)}
            className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            ➕ Vytvoriť novú kartu
          </button>
        </div>
      </div>

      {/* 🔹 Zobrazenie CardCreator po kliknutí */}
      {isCreating && <CardCreator onClose={() => setIsCreating(false)} />}
    </div>
    </MainLayout>
  );
}
