import React, { useEffect, useState, useRef } from "react";
import MainLayout from "../layouts/MainLayout";
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

interface MatchedUser {
  id_user: number;
  meno?: string | null;
  priezvisko?: string | null;
  mail?: string | null;
  rola?: string | null;
  similarity?: number | null;
  similarity_percent?: number | null;
}

interface ArticleType {
  id_article: number;
  title: string;
  text: string;
  image_url?: string | null;
  created_at?: string;
}

export default function Home() {

  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [topError, setTopError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [matchedUsers, setMatchedUsers] = useState<MatchedUser[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [distanceKm, setDistanceKm] = useState<string>("");
  const [articles, setArticles] = useState<ArticleType[]>([]);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const articleScrollerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) {
        setCurrentUserId(null);
        return;
      }
      const parsed = JSON.parse(raw);
      const id = parsed?.id ?? parsed?.id_user ?? null;
      setCurrentUserId(typeof id === "number" ? id : null);
    } catch {
      setCurrentUserId(null);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;

    (async () => {
      try {
        setMatchLoading(true);
        setMatchError(null);
        const params = new URLSearchParams({ top_n: "3" });
        if (distanceKm) {
          params.set("distance_km", distanceKm);
        }
        const res = await fetch(`/api/match/${currentUserId}?${params.toString()}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Nepodarilo sa nacitat odporucania.");
        }
        const data: MatchedUser[] = await res.json();
        if (!cancelled) {
          setMatchedUsers(Array.isArray(data) ? data.slice(0, 3) : []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setMatchError(e.message || "Nepodarilo sa nacitat odporucanych.");
          setMatchedUsers([]);
        }
      } finally {
        if (!cancelled) {
          setMatchLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, distanceKm]);  

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

  useEffect(() => {
    if (!articles.length) return;
    let idx = 0;
    const timer = setInterval(() => {
      idx = (idx + 1) % articles.length;
      const el = articleScrollerRef.current?.children?.[idx] as HTMLElement | undefined;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [articles.length]);

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
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 flex flex-col h-full">
                      <div className="h-56 w-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
                        {a.image_url ? (
                          <img src={a.image_url} alt={a.title} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-sm text-gray-400">Bez obrázka</span>
                        )}
                      </div>
                      <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                        <div className="space-y-2">
                          <h3 className="text-lg font-medium line-clamp-2">{a.title}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{a.description || "Bez popisu"}</p>
                        </div>
                        <p className="text-xs text-gray-500">Kapacita {a.attendees_count}/{a.capacity}</p>
                      </div>
                    </div>
                  </Link>
                ))}

            </div>
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-md p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold">Top zhody pre teba</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Najprv vyfiltrujeme podľa vzdialenosti, potom podľa zhody záľub.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-sm text-gray-600 dark:text-gray-300">
                Vzdialenosť:
              </label>
              <select
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700"
              >
                <option value="">0 km</option>
                <option value="10">do 10 km</option>
                <option value="25">do 25 km</option>
                <option value="50">do 50 km</option>
                <option value="100">do 100 km</option>
              </select>
              {currentUserId && (
                <Link
                  to={`/users?matchFor=${currentUserId}${
                    distanceKm ? `&distance_km=${encodeURIComponent(distanceKm)}` : ""
                  }`}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition"
                >
                  Zobraziť ďalších
                  <span aria-hidden="true">→</span>
                </Link>
              )}
            </div>
          </div>

          {!currentUserId ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
              Prihlas sa, aby sme ti vedeli odporucit ludi s podobnymi zaujmami.
            </p>
          ) : matchLoading ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
              Hladame ti najlepsie zhody...
            </p>
          ) : matchError ? (
            <p className="mt-4 text-sm text-red-500">{matchError}</p>
          ) : matchedUsers.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
              Zatial nemame ziadne odporucania v tvojom meste.
            </p>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {matchedUsers.map((user) => (
                <div
                  key={user.id_user}
                  className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50 dark:bg-gray-800/60 hover:shadow-md transition"
                >
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {(user.meno ?? "") + " " + (user.priezvisko ?? "")}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {user.mail || "Bez e-mailu"}
                  </div>
                  {typeof user.similarity_percent === "number" && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200 px-3 py-1 text-xs font-semibold">
                      Zhoda zaujmov {user.similarity_percent}%
                    </div>
                  )}
                  <Link
                    to={`/user/${user.id_user}`}
                    className="mt-4 inline-flex items-center text-sm text-blue-600 hover:underline"
                  >
                    Zobrazit profil
                    <span className="ml-1" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* === ARTICLES === */}
        <section className="space-y-4 mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Edukacne clanky</h2>
            {isAdmin && (
              <Link
                to="/articles/new"
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                + Pridat clanok
              </Link>
            )}
          </div>

          {articlesError && <p className="text-red-500">{articlesError}</p>}

          {articles.length === 0 && !articlesError && (
            <p className="text-gray-500">Zatial nemame ziadne clanky.</p>
          )}

          {articles.length > 0 && (
            <div
              ref={articleScrollerRef}
              className="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory scroll-smooth scrollbar-hide"
            >
              {articles.map((a) => (
                <Link
                  key={a.id_article}
                  to={`/articles/${a.id_article}`}
                  className="snap-center flex-shrink-0 w-80 md:w-96 lg:w-[28rem] transition-transform duration-300 hover:scale-[1.01]"
                >
                  <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-md overflow-hidden border border-gray-200 dark:border-gray-800">
                    <div className="h-40 w-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                      {a.image_url ? (
                        <img src={a.image_url} alt={a.title} className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-sm text-gray-400">Bez obrazka</span>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold line-clamp-2">{a.title}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
                          {a.text || "Bez obsahu"}
                        </p>
                      </div>
                      {a.created_at && (
                        <p className="text-xs text-gray-500">Publikovane: {String(a.created_at).slice(0, 10)}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

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
