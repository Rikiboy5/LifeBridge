import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Map from "../components/Map";

export type Activity = {
  id_activity: number;
  title: string;
  image_url?: string;
  description?: string;
  capacity: number;
  attendees_count: number;
  lat: number;
  lng: number;
};

export default function Blog() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/activities");
        if (!res.ok) throw new Error("Nepodarilo sa načítať aktivity.");
        const json = await res.json();

        // 🔹 Normalizácia dát – lat/lng na číslo
        const items = (json.items ?? []).map((a: any) => ({
          ...a,
          lat: Number(a.lat),
          lng: Number(a.lng),
        }));

        setActivities(items);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const pins = useMemo(
    () =>
      activities.map((a) => ({
        id: a.id_activity,
        name: a.title,
        lat: a.lat,
        lng: a.lng,
      })),
    [activities]
  );

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-semibold">Sponzorované aktivity</h1>
          <button
            onClick={() => navigate("/activities/create")}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            ➕ Nová aktivita
          </button>
        </div>

        {error && <p className="text-red-500">{error}</p>}
        {loading && <p>Načítavam...</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {activities.map((a) => (
            <div
              key={a.id_activity}
              onClick={() => navigate(`/activities/${a.id_activity}`)}
              className="cursor-pointer rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition"
            >
              {a.image_url && (
                <img
                  src={a.image_url}
                  alt={a.title}
                  className="h-40 w-full object-cover"
                />
              )}
              <div className="p-4">
                <h2 className="text-lg font-semibold">{a.title}</h2>
                <p className="text-sm text-gray-500">
                  Kapacita: {a.attendees_count}/{a.capacity}
                </p>
              </div>
            </div>
          ))}
        </div>

        <Map pins={pins} />
      </div>
    </MainLayout>
  );
}
