import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Map from "../components/Map";

interface Activity {
  id_activity: number;
  title: string;
  description?: string;
  image_url?: string;
  capacity: number;
  attendees_count: number;
  lat: number;
  lng: number;
  user_id: number;
}

export default function ActivityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/activities`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.items ?? [];
        const found = list.find((a: any) => a.id_activity === Number(id));
        if (!found) throw new Error("Aktivita sa nenašla.");
        setActivity({
          ...found,
          lat: Number(found.lat),
          lng: Number(found.lng),
        });
      } catch (e: any) {
        setError(e.message || "Nepodarilo sa načítať aktivitu");
      } finally {
        setLoading(false);
      }
    };
    fetchActivity();
  }, [id]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-80 text-gray-500">
          Načítavam aktivitu...
        </div>
      </MainLayout>
    );
  }

  if (error || !activity) {
    return (
      <MainLayout>
        <div className="flex flex-col justify-center items-center h-80 text-red-600">
          {error || "Aktivita sa nenašla."}
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            ← Späť
          </button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Obrázok */}
        {activity.image_url && (
          <img
            src={activity.image_url}
            alt={activity.title}
            className="w-full h-72 object-cover rounded-xl shadow-md"
          />
        )}

        {/* Názov a popis */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">{activity.title}</h1>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            {activity.description || "Bez popisu"}
          </p>
          <p className="text-sm text-gray-500">
            Kapacita: {activity.attendees_count}/{activity.capacity}
          </p>
        </div>

        {/* Mini-mapa pre túto aktivitu */}
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

        {/* Akčné tlačidlo */}
        <div className="flex justify-center pt-4">
          <button
            onClick={() => alert("Prihlásenie bude doplnené neskôr 😉")}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Prihlásiť sa
          </button>
        </div>
      </div>
    </MainLayout>
  );
}
