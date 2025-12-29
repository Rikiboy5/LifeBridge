import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Map from "../components/Map";

interface Activity {
  id_activity: number;
  title: string;
  description?: string;
  image_url?: string | null;
  capacity: number;
  attendees_count: number;
  lat: number;
  lng: number;
  user_id: number;
}

export default function ActivityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const activityId = Number(id);

  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ title: string; description: string; capacity: number; image: string | null }>({
    title: "",
    description: "",
    capacity: 1,
    image: null,
  });
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const parsed = JSON.parse(raw);
        const uid = parsed?.id ?? parsed?.id_user ?? null;
        setCurrentUserId(typeof uid === "number" ? uid : null);
      }
    } catch {
      setCurrentUserId(null);
    }
  }, []);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setLoading(true);
        if (!Number.isFinite(activityId)) {
          throw new Error("Neplatné ID aktivity.");
        }
        const res = await fetch(`/api/activities/${activityId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Aktivita sa nenašla.");
        setActivity({
          ...data,
          lat: Number(data.lat),
          lng: Number(data.lng),
          image_url: data.image_url || null,
        });
      } catch (e: any) {
        setError(e.message || "Nepodarilo sa nacitat aktivitu");
      } finally {
        setLoading(false);
      }
    };
    fetchActivity();
  }, [id, activityId]);

  useEffect(() => {
    if (activity) {
      setForm({
        title: activity.title || "",
        description: activity.description || "",
        capacity: activity.capacity,
        image: activity.image_url || null,
      });
    }
  }, [activity]);

  const isOwner = !!activity && !!currentUserId && Number(activity.user_id) === Number(currentUserId);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error || new Error("Nepodarilo sa nacitat obrazok."));
        reader.readAsDataURL(file);
      });
      setForm((prev) => ({ ...prev, image: dataUrl }));
    } catch (err: any) {
      alert(err.message || "Nepodarilo sa nacitat obrazok.");
    }
  };

  const handleSave = async () => {
    if (!activity || !currentUserId || !Number.isFinite(activityId)) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        capacity: Number(form.capacity),
        image: form.image,
        user_id: currentUserId,
      };
      const res = await fetch(`/api/activities/${activityId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Ukladanie zlyhalo.");
      }
      setActivity(data);
      setEditing(false);
    } catch (err: any) {
      alert(err.message || "Nepodarilo sa ulozit zmeny.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-80 text-gray-500">Nacitavam aktivitu...</div>
      </MainLayout>
    );
  }

  if (error || !activity) {
    return (
      <MainLayout>
        <div className="flex flex-col justify-center items-center h-80 text-red-600">
          {error || "Aktivita sa nenasla."}
          <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            ← Spat
          </button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Obrazok */}
        {activity.image_url && (
          <div className="w-full max-h-[420px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-md overflow-hidden flex items-center justify-center">
            <img
              src={activity.image_url}
              alt={activity.title}
              className="w-full max-h-[400px] object-contain bg-white dark:bg-gray-900"
            />
          </div>
        )}

        {/* Nazov a popis */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-3xl font-bold break-words">{activity.title}</h1>
            {isOwner && (
              <button onClick={() => setEditing((v) => !v)} className="text-sm text-blue-600 hover:text-blue-700">
                {editing ? "Zrusit" : "Upravit"}
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3 bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Nazov</label>
                <input
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Popis</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Kapacita</label>
                <input
                  type="number"
                  min={1}
                  className="w-32 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                  value={form.capacity}
                  onChange={(e) => setForm((prev) => ({ ...prev, capacity: Number(e.target.value) || 1 }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Obrazok</label>
                <input type="file" accept="image/*" onChange={handleFileChange} />
                {form.image && (
                  <div className="flex items-start gap-3">
                    <img
                      src={form.image}
                      alt="Nahlad"
                      className="h-24 w-24 object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                    />
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:text-red-700"
                      onClick={() => setForm((prev) => ({ ...prev, image: null }))}
                    >
                      Odstranit obrazok
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Ukladam..." : "Ulozit"}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setForm({
                      title: activity.title || "",
                      description: activity.description || "",
                      capacity: activity.capacity,
                      image: activity.image_url || null,
                    });
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700"
                  disabled={saving}
                >
                  Zrusit
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed break-words whitespace-pre-line">
                {activity.description || "Bez popisu"}
              </p>
              <p className="text-sm text-gray-500">
                Kapacita: {activity.attendees_count}/{activity.capacity}
              </p>
            </>
          )}
        </div>

        {/* Mini-mapa pre tuto aktivitu */}
        <div className="rounded-xl overflow-hidden border border-gray-300 dark:border-gray-700 shadow">
          <Map
            pins={[
              {
                id: activity.id_activity,
                name: activity.title,
                lat: activity.lat,
                lng: activity.lng,
                description: activity.description || "",
              },
            ]}
          />
        </div>

        {/* Akcne tlacidlo */}
        <div className="flex justify-center pt-4">
          <button
            onClick={() => alert("Prihlasenie bude doplnene neskor")}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Prihlasit sa
          </button>
        </div>
      </div>
    </MainLayout>
  );
}
