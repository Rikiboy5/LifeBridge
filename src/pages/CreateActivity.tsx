import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Map from "../components/Map";

export default function CreateActivity() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: "",
    description: "",
    image_url: "",
    capacity: 10,
    lat: 48.1486,
    lng: 17.1077,
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mapClickRef = useRef<{ lat: number; lng: number } | null>(null);

  const user = JSON.parse(localStorage.getItem("user") || "null");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        name === "capacity"
          ? Number(value)
          : name === "lat" || name === "lng"
          ? Number(value)
          : value,
    }));
  };

  const handleMapClick = (coords: { lat: number; lng: number }) => {
    mapClickRef.current = coords;
    setForm((prev) => ({ ...prev, lat: coords.lat, lng: coords.lng }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate("/login");
      return;
    }
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("http://127.0.0.1:5000/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          user_id: user.id_user,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chyba pri vytváraní aktivity");

      navigate("/activities");
    } catch (err: any) {
      setError(err.message || "Neznáma chyba");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <h1 className="text-3xl font-semibold">Vytvoriť novú aktivitu</h1>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/30 p-3 text-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-5 bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-6"
        >
          <div>
            <label className="block mb-1 text-sm font-medium">Názov</label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              required
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
              placeholder="Názov aktivity"
            />
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium">Popis</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
              placeholder="Stručný popis aktivity"
            />
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium">Obrázok (URL)</label>
            <input
              name="image_url"
              value={form.image_url}
              onChange={handleChange}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-sm font-medium">Kapacita</label>
              <input
                type="number"
                name="capacity"
                min={1}
                value={form.capacity}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">Poloha</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.0001"
                  name="lat"
                  value={form.lat}
                  onChange={handleChange}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
                />
                <input
                  type="number"
                  step="0.0001"
                  name="lng"
                  value={form.lng}
                  onChange={handleChange}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Ukladám..." : "Vytvoriť aktivitu"}
          </button>
        </form>

        <div className="h-[400px] mt-6">
          <Map
            pins={[
              {
                id: 0,
                name: form.title || "Nová aktivita",
                lat: form.lat,
                lng: form.lng,
                description: form.description,
              },
            ]}
            onClick={handleMapClick}
          />
        </div>
      </div>
    </MainLayout>
  );
}
