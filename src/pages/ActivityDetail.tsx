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
  const [form, setForm] = useState<{ title: string; description: string; capacity: string; image: string | null }>({
    title: "",
    description: "",
    capacity: "1",
    image: null,
  });
  const [removeImage, setRemoveImage] = useState(false);
  const [signups, setSignups] = useState<Array<{ id_user: number; meno?: string; priezvisko?: string; rola?: string }>>(
    []
  );
  const [signupsLoading, setSignupsLoading] = useState(false);
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
        capacity: String(activity.capacity),
        image: activity.image_url || null,
      });
      setRemoveImage(false);
    }
  }, [activity]);

  const isOwner = !!activity && !!currentUserId && Number(activity.user_id) === Number(currentUserId);
  const isSignedUp = !!currentUserId && signups.some((s) => Number(s.id_user) === Number(currentUserId));
  const isFull = !!activity && activity.attendees_count >= activity.capacity && !isSignedUp;

  const refreshSignups = async () => {
    if (!Number.isFinite(activityId)) return;
    setSignupsLoading(true);
    try {
      const res = await fetch(`/api/activities/${activityId}/signups`);
      if (res.ok) {
        const rows = await res.json();
        setSignups(Array.isArray(rows) ? rows : []);
      } else {
        setSignups([]);
      }
    } catch {
      setSignups([]);
    } finally {
      setSignupsLoading(false);
    }
  };

  useEffect(() => {
    refreshSignups();
  }, [activityId]);

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
      setRemoveImage(false);
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
        capacity: parseInt(form.capacity, 10),
        image: form.image,
        remove_image: removeImage,
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
      setActivity({
        ...data,
        image_url: data?.image_url || null,
        lat: Number(data?.lat),
        lng: Number(data?.lng),
      });
      setEditing(false);
      setRemoveImage(false);
      refreshSignups();
    } catch (err: any) {
      alert(err.message || "Nepodarilo sa ulozit zmeny.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignup = async () => {
    if (!activity) return;
    if (!currentUserId) {
      navigate("/login");
      return;
    }
    if (isFull) {
      alert("Kapacita je naplnena.");
      return;
    }
    try {
      const res = await fetch(`/api/activities/${activityId}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUserId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Prihlasenie zlyhalo.");
      if (activity && typeof data?.attendees_count === "number") {
        setActivity({ ...activity, attendees_count: data.attendees_count });
      }
      await refreshSignups();
    } catch (err: any) {
      alert(err.message || "Prihlasenie zlyhalo.");
    }
  };

  const handleCancelSignup = async () => {
    if (!activity || !currentUserId) return;
    try {
      const res = await fetch(`/api/activities/${activityId}/signup`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUserId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Odhlasenie zlyhalo.");
      if (activity && typeof data?.attendees_count === "number") {
        setActivity({ ...activity, attendees_count: data.attendees_count });
      }
      await refreshSignups();
    } catch (err: any) {
      alert(err.message || "Odhlasenie zlyhalo.");
    }
  };

  const handleDeleteActivity = async () => {
    if (!activity || !currentUserId) return;
    if (!window.confirm("Naozaj zmazat tuto aktivitu?")) return;
    try {
      const res = await fetch(`/api/activities/${activityId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUserId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Mazanie zlyhalo.");
      navigate("/activities");
    } catch (err: any) {
      alert(err.message || "Mazanie zlyhalo.");
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
              <div className="flex gap-2">
                <button onClick={() => setEditing((v) => !v)} className="text-sm text-blue-600 hover:text-blue-700">
                  {editing ? "Zrusit" : "Upravit"}
                </button>
                <button onClick={handleDeleteActivity} className="text-sm text-red-600 hover:text-red-700">
                  Zmazat
                </button>
              </div>
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
                  onChange={(e) => setForm((prev) => ({ ...prev, capacity: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Obrazok</label>
                <input type="file" accept="image/*" onChange={handleFileChange} />
                {(form.image || activity.image_url) && (
                  <div className="flex items-start gap-3">
                    <img
                      src={form.image || activity.image_url || undefined}
                      alt="Nahlad"
                      className="h-24 w-24 object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                    />
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:text-red-700"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, image: null }));
                        setRemoveImage(true);
                      }}
                    >
                      Odstranit obrazok
                    </button>
                  </div>
                )}
                {removeImage && (
                  <p className="text-xs text-red-600">Obrazok bude po ulozeni odstranený.</p>
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
                    setRemoveImage(false);
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
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed break-words break-all whitespace-pre-line">
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

        {/* Prihlasenie / odhlasenie */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {isSignedUp ? (
              <button
                onClick={handleCancelSignup}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
              >
                Odhlasit sa
              </button>
            ) : (
              <button
                onClick={handleSignup}
                disabled={isFull}
                className={`px-4 py-2 rounded-lg text-white transition ${
                  isFull ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {isFull ? "Kapacita plna" : "Prihlasit sa"}
              </button>
            )}
            <span className="text-sm text-gray-600">
              {activity.attendees_count}/{activity.capacity} prihlasenych
            </span>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Prihlaseni uzivatelia</p>
              {signupsLoading && <span className="text-xs text-gray-500">Nacitavam...</span>}
            </div>
            {signups.length === 0 ? (
              <p className="text-sm text-gray-500">Zatial nikto.</p>
            ) : (
              <div className="space-y-2">
                {signups.map((u) => (
                  <button
                    key={u.id_user}
                    onClick={() => navigate(`/user/${u.id_user}`)}
                    className="w-full flex justify-between items-center text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-800 dark:text-gray-100">
                      {(u.meno || "").trim()} {(u.priezvisko || "").trim()}
                    </span>
                    <span className="text-xs text-gray-500">{u.rola || ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
