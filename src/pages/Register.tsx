import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";

interface Hobby {
  id_hobby: number;
  nazov: string;
  id_kategoria: number;
  kategoria_nazov: string;
  kategoria_ikona: string;
}

interface Category {
  id_kategoria: number;
  nazov: string;
  ikona: string;
  pocet_hobby: number;
}

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const ROLE_OPTIONS = [
    {
      value: "user_dobrovolnik",
      title: "Dobrovoľník",
      description: "Chcem pomáhať a ponúkať svoj čas či služby.",
      icon: "🤝",
    },
    {
      value: "user_firma",
      title: "Firma",
      description: "Reprezentujem firmu alebo organizáciu.",
      icon: "🏢",
    },
    {
      value: "user_senior",
      title: "Dôchodca",
      description: "Hľadám príležitosti na aktivity a podporu.",
      icon: "🧓",
    },
  ] as const;

  const [form, setForm] = useState({
    name: "",
    surname: "",
    email: "",
    password: "",
    password_confirm: "",
    birthdate: "",
    role: "",
  });
  const [selectedHobbies, setSelectedHobbies] = useState<number[]>([]);
  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
  });
  const [passwordsMatch, setPasswordsMatch] = useState(true);

  // Načítanie hobby a kategórií z API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [hobbiesRes, categoriesRes] = await Promise.all([
          fetch("/api/hobbies"),
          fetch("/api/hobby-categories"),
        ]);
        const hobbiesData = await hobbiesRes.json();
        const categoriesData = await categoriesRes.json();
        setHobbies(hobbiesData);
        setCategories(categoriesData);
      } catch (err) {
        console.error("Chyba pri načítaní dát:", err);
      }
    };
    fetchData();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });

    // Real-time validácia hesla
    if (name === "password") {
      setPasswordStrength({
        length: value.length >= 8,
        uppercase: /[A-Z]/.test(value),
        lowercase: /[a-z]/.test(value),
        number: /\d/.test(value),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(value),
      });
    }

    // Kontrola zhody hesiel
    if (name === "password_confirm" || name === "password") {
      const pwd = name === "password" ? value : form.password;
      const confirm = name === "password_confirm" ? value : form.password_confirm;
      setPasswordsMatch(confirm === "" || pwd === confirm);
    }
  };

  const handleHobbyToggle = (hobbyId: number) => {
    setSelectedHobbies((prev) =>
      prev.includes(hobbyId)
        ? prev.filter((id) => id !== hobbyId)
        : [...prev, hobbyId]
    );
  };

  const handleNextStep = () => {
    setMessage("");
    
    if (!form.name || !form.surname || !form.email || !form.password || !form.password_confirm || !form.birthdate || !form.role) {
      setMessage("Vyplň všetky polia.");
      return;
    }

    if (form.password !== form.password_confirm) {
      setMessage("Heslá sa nezhodujú.");
      return;
    }

    const allValid = Object.values(passwordStrength).every((v) => v === true);
    if (!allValid) {
      setMessage("Heslo nespĺňa bezpečnostné požiadavky.");
      return;
    }

    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setSuccess(false);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          hobbies: selectedHobbies,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registrácia zlyhala");

      setSuccess(true);
      setShowSuccessModal(true);
      
      setTimeout(() => {
        navigate("/");
      }, 3000);
      
    } catch (err: any) {
      setMessage("❌ " + err.message);
    }
  };

  const getStrengthColor = (isValid: boolean) => {
    return isValid ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400";
  };

  const allValid = Object.values(passwordStrength).every((v) => v === true);

  // Filter hobby podľa vybranej kategórie
  const filteredHobbies = selectedCategory
    ? hobbies.filter((h) => h.id_kategoria === selectedCategory)
    : hobbies;

  return (
    <MainLayout>
      <div className="flex items-center justify-center p-4 min-h-screen">
        
        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl transform animate-slideUp">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 mb-4">
                  <svg
                    className="h-10 w-10 text-green-600 dark:text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Registrácia úspešná! 🎉
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Tvoj účet bol úspešne vytvorený.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Presmerovanie na hlavnú stránku...
                </p>
                <div className="mt-4">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full animate-progress w-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 shadow-xl rounded-2xl p-8 w-full max-w-2xl text-gray-800 dark:text-gray-100">
          
          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className={`text-sm font-medium ${step >= 1 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                1. Základné údaje
              </span>
              <span className={`text-sm font-medium ${step >= 2 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                2. Výber záujmov
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: step === 1 ? '50%' : '100%' }}
              />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-blue-700 dark:text-blue-400 mb-6">
            Registrácia používateľa
          </h2>

          {/* KROK 1: Základné údaje */}
          {step === 1 && (
            <div className="space-y-4">
              <input
                type="text"
                name="name"
                placeholder="Meno"
                value={form.name}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
              />
              
              <input
                type="text"
                name="surname"
                placeholder="Priezvisko"
                value={form.surname}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
              />
              
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={form.email}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
              />

              <div>
                <input
                  type="password"
                  name="password"
                  placeholder="Heslo"
                  value={form.password}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                />
                
                {form.password && (
                  <div className="mt-2 text-xs space-y-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                    <p className="font-semibold mb-1 text-gray-700 dark:text-gray-300">Požiadavky na heslo:</p>
                    <p className={getStrengthColor(passwordStrength.length)}>
                      {passwordStrength.length ? "✓" : "✗"} Minimálne 8 znakov
                    </p>
                    <p className={getStrengthColor(passwordStrength.uppercase)}>
                      {passwordStrength.uppercase ? "✓" : "✗"} Aspoň 1 veľké písmeno
                    </p>
                    <p className={getStrengthColor(passwordStrength.lowercase)}>
                      {passwordStrength.lowercase ? "✓" : "✗"} Aspoň 1 malé písmeno
                    </p>
                    <p className={getStrengthColor(passwordStrength.number)}>
                      {passwordStrength.number ? "✓" : "✗"} Aspoň 1 číslo
                    </p>
                    <p className={getStrengthColor(passwordStrength.special)}>
                      {passwordStrength.special ? "✓" : "✗"} Aspoň 1 špeciálny znak
                    </p>
                  </div>
                )}
              </div>

              <div>
                <input
                  type="password"
                  name="password_confirm"
                  placeholder="Potvrď heslo"
                  value={form.password_confirm}
                  onChange={handleChange}
                  className={`w-full p-3 border rounded-md focus:ring-2 focus:outline-none bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 ${
                    passwordsMatch
                      ? "border-gray-300 dark:border-gray-600 focus:ring-blue-400"
                      : "border-red-500 focus:ring-red-400"
                  }`}
                />
                {!passwordsMatch && form.password_confirm && (
                  <p className="text-red-500 text-xs mt-1">⚠️ Heslá sa nezhodujú</p>
                )}
                {passwordsMatch && form.password_confirm && form.password === form.password_confirm && (
                  <p className="text-green-600 dark:text-green-400 text-xs mt-1">✓ Heslá sa zhodujú</p>
                )}
              </div>

              <div>
                <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">Dátum narodenia</label>
                <input
                  type="date"
                  name="birthdate"
                  value={form.birthdate}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                />
              </div>


              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Vyber si svoju rolu.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {ROLE_OPTIONS.map((role) => {
                    const selected = form.role === role.value;
                    return (
                      <button
                        type="button"
                        key={role.value}
                        onClick={() => setForm((prev) => ({ ...prev, role: role.value }))}
                        className={`text-left rounded-xl border p-3 transition focus:outline-none focus:ring-2 ${
                          selected
                            ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 focus:ring-blue-600"
                            : "border-gray-200 dark:border-gray-700 hover:border-blue-400 focus:ring-blue-400"
                        }`}
                      >
                        <div className="text-2xl mb-1">{role.icon}</div>
                        <p className="font-semibold">{role.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{role.description}</p>
                      </button>
                    );
                  })}
                </div>
                {!form.role && (
                  <p className="text-xs text-red-500 mt-1">Vyber si svoju rolu.</p>
                )}
              </div>

              <button
                type="button"
                onClick={handleNextStep}
                disabled={!allValid || !passwordsMatch || !form.password_confirm}
                className={`w-full mt-4 font-semibold p-3 rounded-md transition ${
                  allValid && passwordsMatch && form.password_confirm
                    ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                    : "bg-gray-400 dark:bg-gray-600 text-gray-200 cursor-not-allowed"
                }`}
              >
                Ďalej →
              </button>

              {message && (
                <p className="text-center mt-3 text-sm font-medium text-red-500">
                  {message}
                </p>
              )}
            </div>
          )}

          {/* KROK 2: Výber záujmov s kategóriami */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4">
                Vyber si svoje záujmy z kategórií:
              </p>

              {/* Filter kategórií */}
              <div className="flex flex-wrap gap-2 justify-center mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                    selectedCategory === null
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`}
                >
                  Všetko
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id_kategoria}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id_kategoria)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      selectedCategory === cat.id_kategoria
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    {cat.ikona} {cat.nazov.replace(/^.+ /, '')}
                  </button>
                ))}
              </div>

              {/* Hobby Pills */}
              <div className="flex flex-wrap gap-2 justify-center p-2 max-h-96 overflow-y-auto">
                {filteredHobbies.map((hobby) => (
                  <button
                    key={hobby.id_hobby}
                    type="button"
                    onClick={() => handleHobbyToggle(hobby.id_hobby)}
                    className={`px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 ${
                      selectedHobbies.includes(hobby.id_hobby)
                        ? "bg-blue-600 text-white shadow-md transform scale-105"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    {hobby.nazov}
                  </button>
                ))}
              </div>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
                Vybraté: {selectedHobbies.length}
              </p>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-semibold p-3 rounded-md hover:bg-gray-400 dark:hover:bg-gray-600 transition"
                >
                  ← Späť
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white font-semibold p-3 rounded-md hover:bg-blue-700 transition"
                >
                  Registrovať
                </button>
              </div>

              {message && (
                <p
                  className={`text-center mt-3 text-sm font-medium ${
                    success ? "text-green-600 dark:text-green-400" : "text-red-500"
                  }`}
                >
                  {message}
                </p>
              )}
            </form>
          )}
        </div>
      </div>

      {/* CSS Animácie */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes progress {
          from {
            width: 0%;
          }
          to {
            width: 100%;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.4s ease-out;
        }

        .animate-progress {
          animation: progress 3s linear;
        }
      `}</style>
    </MainLayout>
  );
}
