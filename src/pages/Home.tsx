import React, { useEffect, useState, useRef } from "react";
import MainLayout from "../layouts/MainLayout";
import Article from "../components/Article";
import Map from "../components/Map";
import { Link } from "react-router-dom";

// ---- TYPES ----
interface Activity {
  id_activity: number;
  title: string;
  description?: string;
  image_url?: string;
  capacity: number;
  attendees_count: number;
  lat: number;
  lng: number;
  category?: string; // FIX – optional category
}

interface TopUser {
  id_user: number;
  meno?: string | null;
  priezvisko?: string | null;
  mail?: string | null;
  rola?: string | null;
  avg_rating?: number | null;
  rating_count?: number | null;
}

interface ArticleType {
  id_article: number;
  title: string;
  text: string;
  image_url?: string | null;
  created_at?: string;
}

export default function Home() {
  // ---- STATES ----
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [topError, setTopError] = useState<string | null>(null);

  const [articles, setArticles] = useState<ArticleType[]>([]);
  const [articlesError, setArticlesError] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // ---- LOAD ARTICLES ----

  const storedUser = JSON.parse(localStorage.getItem("user") || "null");
  const isAdmin = storedUser?.role === "admin";
  useEffect(() => {
    (async () => {
      try {
        setArticlesError(null);
        const res = await fetch("/api/articles"); // cez Vite proxy
        if (!res.ok) throw new Error("Nepodarilo sa načítať články");

        const data = await res.json();
        setArticles(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setArticlesError(e.message || "Chyba pri načítaní článkov");
      }
    })();
  }, []);

  // ---- LOAD ACTIVITIES ----
  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const res = await fetch("/api/activities?page_size=50");
        const data = await res.json();

        const items = Array.isArray(data) ? data : data.items ?? [];

        const normalized = items.map((a: any) => ({
          ...a,
          lat: Number(a.lat),
          lng: Number(a.lng),
        }));

        setActivities(normalized);
      } catch (e: any) {
        setError(e.message || "Nepodarilo sa načítať aktivity");
      }
    })();
  }, []);

  // ---- LOAD TOP USERS ----
  useEffect(() => {
    (async () => {
      try {
        setTopError(null);
        const res = await fetch("/api/users/top-rated?limit=6&days=7");
        if (!res.ok) throw new Error("Nepodarilo sa načítať");

        const data: TopUser[] = await res.json();
        setTopUsers(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setTopError(e.message || "Nepodarilo sa načítať najlepších používateľov");
      }
    })();
  }, []);

  // ---- SCROLL FUNCTION ----
  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  // ---- DYNAMIC MAP PINS ----
  const dynamicPins = activities.map((a) => ({
    id: a.id_activity,
    name: a.title,
    lat: a.lat,
    lng: a.lng,
    description: a.description || "",
    category: a.category ?? "default",
  }));



  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-8 space-y-12">
        <h1 className="text-3xl font-bold text-center mb-10">
          🌉 Ponuky používateľov LifeBridge
        </h1>

        {/* === CAROUSEL === */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Nadchádzajúce aktivity</h2>
            <Link to="/blog" className="text-blue-600 hover:underline">
              Zobraziť všetky
            </Link>
          </div>

          {error ? (
            <div className="text-red-600 text-sm">{error}</div>
          ) : (
            <div className="relative max-w-5xl mx-auto">
              {/* Ľavá šípka */}
              <button
                type="button"
                aria-label="Posun doľava"
                onClick={() => scrollBy(-1)}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center rounded-full bg-white/90 dark:bg-gray-800/90 shadow hover:bg-blue-600 hover:text-white transition"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5">
                  <path d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>

              {/* Pravá šípka */}
              <button
                type="button"
                aria-label="Posun doprava"
                onClick={() => scrollBy(1)}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center rounded-full bg-white/90 dark:bg-gray-800/90 shadow hover:bg-blue-600 hover:text-white transition"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5">
                  <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              {/* SLIDER */}
              <div
                ref={scrollerRef}
                className="flex overflow-x-auto gap-6 pb-4 snap-x snap-mandatory scroll-smooth scrollbar-hide"
              >
                {activities.map((a) => (
                  <Link
                    key={a.id_activity}
                    to={`/activities/${a.id_activity}`}
                    className="snap-center flex-shrink-0 w-[90%] sm:w-[70%] md:w-[55%] lg:w-[45%] transition-transform duration-300 hover:scale-[1.02]"
                  >
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
                      {a.image_url && (
                        <img src={a.image_url} alt={a.title} className="w-full h-56 object-cover" />
                      )}
                      <div className="p-4 space-y-2">
                        <h3 className="text-lg font-medium line-clamp-1">{a.title}</h3>
                        {a.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                            {a.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          Kapacita {a.attendees_count}/{a.capacity}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* === ARTICLES === */}
        

        <section className="space-y-6 mt-10">
          <h2 className="text-2xl font-semibold">Edukačné články</h2>

          {articlesError && <p className="text-red-500">{articlesError}</p>}

          {articles.length === 0 && !articlesError && (
            <p className="text-gray-500">Zatiaľ nemáme žiadne články.</p>
          )}

          <div className="space-y-4">
            {articles.map((a) => (
              <Article
                key={a.id_article}
                id={a.id_article}
                title={a.title}
                text={a.text}
                image={a.image_url ?? undefined}
              />
            ))}
          </div>
          <div className="flex justify-end">
 {isAdmin && (
  <div className="flex justify-end">
    <Link
      to="/articles/new"
      className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
    >
      ➕ Pridať článok
    </Link>
  </div>
)}

</div>

        </section>

        {/* === MAP === */}
        <Map pins={dynamicPins} />

        {/* === TOP USERS === */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-md p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Najlepšie hodnotení používatelia</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Hodnotenie za posledný týždeň.
              </p>
            </div>
            <Link to="/users" className="text-blue-600 hover:underline text-sm">
              Zobraziť všetkých
            </Link>
          </div>

          {topError && <p className="text-red-500 mt-4">{topError}</p>}

          {topUsers.length > 0 && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {topUsers.map((user, index) => (
                <div
                  key={user.id_user}
                  className="flex items-center gap-4 rounded-xl border border-gray-100 dark:border-gray-700 p-4 hover:shadow"
                >
                  <div className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-lg font-semibold">
                      {(user.meno ?? "") + " " + (user.priezvisko ?? "")}
                    </p>
                    <p className="text-sm text-gray-500">{user.mail}</p>
                    <div className="text-sm text-yellow-500 flex items-center gap-1 mt-1">
                      <span>★</span>
                      <span>{(user.avg_rating ?? 0).toFixed(1)}</span>
                      <span className="text-xs text-gray-500">
                        ({user.rating_count ?? 0})
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
}
