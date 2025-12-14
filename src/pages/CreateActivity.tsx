import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";

interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export default function CreateActivity() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: "",
    description: "",
    image_url: "",
    capacity: 10,
    address: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Autocomplete state
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const debounceTimer = useRef<number | null>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);

  const user = JSON.parse(localStorage.getItem("user") || "null");

  // Zatvorenie suggestions pri kliku mimo
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "capacity" ? Number(value) : value,
    }));

    // Autocomplete pre adresu
    if (name === "address") {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      
      if (value.length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      debounceTimer.current = setTimeout(() => {
        fetchAddressSuggestions(value);
      }, 500) as any;
    }
  };

  const fetchAddressSuggestions = async (query: string) => {
    setIsLoadingSuggestions(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8&addressdetails=1&accept-language=sk`;
      console.log("Volám Nominatim API:", url);
      
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'LifeBridge App'
        }
      });
      
      if (!res.ok) {
        console.error("API chyba:", res.status, res.statusText);
        setSuggestions([]);
        setShowSuggestions(false);
        setIsLoadingSuggestions(false);
        return;
      }
      
      const data = await res.json();
      
      console.log("Nominatim odpoveď:", data);
      console.log("Počet výsledkov:", data.length);
      
      if (!data || data.length === 0) {
        console.log("Žiadne výsledky");
        setSuggestions([]);
        setShowSuggestions(false);
        setIsLoadingSuggestions(false);
        return;
      }
      
      // DÔLEŽITÉ: Nominatim vracia priamo pole, NIE data.features!
      const formatted: AddressSuggestion[] = data.map((item: any) => {
        // Skús vytvoriť krajšie formátovanú adresu
        const addr = item.address;
        let parts: string[] = [];
        
        if (addr) {
          if (addr.road) parts.push(addr.road);
          if (addr.house_number) parts.push(addr.house_number);
          if (addr.city || addr.town || addr.village) {
            parts.push(addr.city || addr.town || addr.village);
          }
          if (addr.country) parts.push(addr.country);
        }
        
        const display_name = parts.length > 0 ? parts.join(", ") : item.display_name;
        
        return {
          display_name,
          lat: item.lat,
          lon: item.lon,
        };
      });
      
      console.log("Formátované návrhy:", formatted);
      
      setSuggestions(formatted);
      setShowSuggestions(formatted.length > 0);
    } catch (err) {
      console.error("Chyba pri načítaní návrhov:", err);
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: AddressSuggestion) => {
    setForm((prev) => ({ ...prev, address: suggestion.display_name }));
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      navigate("/login");
      return;
    }

    if (!form.title || form.title.trim().length === 0) {
      setError("Názov aktivity je povinný.");
      return;
    }

    if (!form.address || form.address.trim().length === 0) {
      setError("Adresa je povinná.");
      return;
    }

    if (form.capacity < 1) {
      setError("Kapacita musí byť aspoň 1.");
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          image_url: form.image_url,
          capacity: form.capacity,
          address: form.address,
          user_id: user.id,
        }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // ak telo nie je JSON, necháme data = null
      }

      if (!res.ok) {
        const msg =
          (data && (data.error || data.details)) ||
          `Chyba pri vytváraní aktivity (HTTP ${res.status})`;
        throw new Error(msg);
      }

      navigate("/activities");
    } catch (err: any) {
      setError(err.message || "Neznáma chyba");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">
          Vytvor novú aktivitu
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
          
          {/* Názov */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Názov aktivity *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={form.title}
              onChange={handleChange}
              required
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Napr. Beh v parku"
            />
          </div>

          {/* Popis */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Popis
            </label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Krátky popis aktivity..."
            />
          </div>

          {/* Adresa s AUTOCOMPLETE */}
          <div className="relative" ref={suggestionRef}>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Adresa *
            </label>
            <input
              type="text"
              id="address"
              name="address"
              value={form.address}
              onChange={handleChange}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              required
              autoComplete="off"
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Začni písať mesto alebo ulicu..."
            />
            
            {/* Loading indicator */}
            {isLoadingSuggestions && (
              <div className="absolute right-3 top-11 text-gray-400">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 last:border-b-0 transition"
                  >
                    <div className="text-sm text-gray-800 dark:text-white font-medium">
                      📍 {suggestion.display_name}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Zadaj aspoň 3 znaky pre návrhy miest
            </p>
          </div>

          {/* URL obrázka */}
          <div>
            <label htmlFor="image_url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              URL obrázka
            </label>
            <input
              type="url"
              id="image_url"
              name="image_url"
              value={form.image_url}
              onChange={handleChange}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="https://..."
            />
          </div>

          {/* Kapacita */}
          <div>
            <label htmlFor="capacity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Kapacita *
            </label>
            <input
              type="number"
              id="capacity"
              name="capacity"
              value={form.capacity}
              onChange={handleChange}
              min="1"
              required
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* Error hlásenie */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded-md">
              ⚠️ {error}
            </div>
          )}

          {/* Submit tlačidlo */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 px-4 rounded-md font-semibold text-white transition ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "Vytváram..." : "Vytvoriť aktivitu"}
          </button>
        </form>
      </div>
    </MainLayout>
  );
}
