import { useEffect, useMemo, useRef, useState } from "react";
import Map from "../components/Map";
import MainLayout from "../layouts/MainLayout";
import { useNavigate } from "react-router-dom";

const useApi = true; // prepínač API/localStorage
const LS_KEY = "lifebridge:activities";

export type Activity = {
  id_activity: number;
  title: string;
  image_url?: string;
  description?: string;
  capacity: number;
  attendees_count: number;
  lat: number;
  lng: number;
  user_id: number;
  created_at?: string;
};

export default function Blog() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    image_url: "",
    description: "",
    capacity: 10,
    lat: 48.1486,
    lng: 17.1077,
  });

  const navigate = useNavigate();
  const mapClickRef = useRef<{ lat: number; lng: number } | null>(null);

  // auth user z localStorage (rovnaký pattern ako Posts)
  const user = useMemo(() => {
    const u = localStorage.getItem("user");
    if (!u) return null;
    try {
      const parsed = JSON.parse(u);
      // Ak nemá id_user, môžeš ho prepísať napr. z id
      if (!parsed.id_user && parsed.id) {
        parsed.id_user = parsed.id;
      }
      return parsed;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        setError(null);
        if (useApi) {
          const res = await fetch("http://127.0.0.1:5000/api/activities");
          if (!res.ok) throw new Error("Chyba pri načítaní aktivít");
          const data = await res.json();
          setActivities(Array.isArray(data) ? data : data.items ?? []);
        } else {
          const raw = localStorage.getItem(LS_KEY);
          setActivities(raw ? JSON.parse(raw) : []);
        }
      } catch (e: any) {
        setError(e.message || "Neznáma chyba");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const persistLocal = (items: Activity[]) => {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  };

  const pins = useMemo(
    () =>
      activities.map((a) => ({
        id: a.id_activity,
        name: a.title,
        lat: a.lat,
        lng: a.lng,
        description: a.description || "",
      })),
    [activities]
  );

  const onChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target as any;
    setForm((prev) => ({
      ...prev,
      [name]:
        name === "capacity" ? Number(value) :
        name === "lat" || name === "lng" ? Number(value) : value,
    }));
  };

  const onMapClick = (coords: { lat: number; lng: number }) => {
    mapClickRef.current = coords;
    setForm((prev) => ({ ...prev, lat: coords.lat, lng: coords.lng }));
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (!user) {
      navigate("/login");
      return;
    }
    try {
      setError(null);
      if (useApi) {
        const res = await fetch("http://127.0.0.1:5000/api/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, user_id: user.id_user }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Chyba pri vytváraní aktivity");
        setActivities((prev) => [data, ...prev]);
      } else {
        const id = Date.now();
        const a: Activity = {
          id_activity: id,
          title: form.title,
          image_url: form.image_url,
          description: form.description,
          capacity: form.capacity,
          attendees_count: 0,
          lat: form.lat,
          lng: form.lng,
          user_id: user.id_user,
          created_at: new Date().toISOString(),
        };
        setActivities((prev) => {
          const items = [a, ...prev];
          persistLocal(items);
          return items;
        });
      }
      setForm((f) => ({ ...f, title: "", image_url: "", description: "" }));
    } catch (e: any) {
      setError(e.message || "Neznáma chyba");
    }
  };

  const join = async (id: number) => {
    if (!user) {
      navigate("/login");
      return;
    }
    try {
      if (useApi) {
        const res = await fetch(`http://127.0.0.1:5000/api/activities/${id}/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id_user }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Chyba prihlásenia");
        // aktualizuj lokálny stav
        setActivities((prev) =>
          prev.map((a) => (a.id_activity === id ? { ...a, attendees_count: data.attendees_count } : a))
        );
      } else {
        setActivities((prev) => {
          const items = prev.map((a) =>
            a.id_activity === id && a.attendees_count < a.capacity
              ? { ...a, attendees_count: a.attendees_count + 1 }
              : a
          );
          persistLocal(items);
          return items;
        });
      }
    } catch (e: any) {
      setError(e.message || "Neznáma chyba");
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl p-4 space-y-8">
        <h1 className="text-3xl font-semibold">Blog / Aktivity</h1>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/30 p-3 text-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        <form
          onSubmit={submitCreate}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-4"
        >
          <div className="space-y-3">
            <div>
              <label className="block mb-1 text-sm">Nadpis</label>
              <input
                name="title"
                value={form.title}
                onChange={onChange}
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
                placeholder="Názov aktivity"
                required
              />
            </div>
            <div>
              <label className="block mb-1 text-sm">Obrázok (URL)</label>
              <input
                name="image_url"
                value={form.image_url}
                onChange={onChange}
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block mb-1 text-sm">Popis</label>
              <textarea
                name="description"
                value={form.description}
                onChange={onChange}
                rows={4}
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
                placeholder="Stručný popis aktivity"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 text-sm">Kapacita</label>
                <input
                  type="number"
                  name="capacity"
                  min={1}
                  value={form.capacity}
                  onChange={onChange}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-sm">Lat</label>
                  <input
                    type="number"
                    step="0.0001"
                    name="lat"
                    value={form.lat}
                    onChange={onChange}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm">Lng</label>
                  <input
                    type="number"
                    step="0.0001"
                    name="lng"
                    value={form.lng}
                    onChange={onChange}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="mt-2 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Pridať aktivitu
            </button>
          </div>
        </form>

        {activities.length > 0 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {activities.map((a) => (
                <div key={a.id_activity} className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                  {a.image_url && (
                    <img src={a.image_url} alt={a.title} className="h-40 w-full object-cover" />
                  )}
                  <div className="p-4 space-y-2">
                    <h3 className="text-lg font-medium">{a.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{a.description}</p>
                    <p className="text-sm">Kapacita: {a.attendees_count}/{a.capacity}</p>
                    <button
                      disabled={a.attendees_count >= a.capacity}
                      onClick={() => join(a.id_activity)}
                      className="mt-2 inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      Prihlásiť sa
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Map pins={pins} />
          </div>
        )}
      </div>
    </MainLayout>
  );
}
