import React, { useEffect, useState, useRef } from "react";
import MainLayout from "../layouts/MainLayout";
import Card from "../components/Card";
import Map from "../components/Map";
import { Link } from "react-router-dom";

import Garden from "../assets/img/garden.png";
import Britain from "../assets/img/gb.png";
import laptop from "../assets/img/laptop.png";

interface Activity {
  id_activity: number;
  title: string;
  description?: string;
  image_url?: string;
  capacity: number;
  attendees_count: number;
  lat: number;
  lng: number;
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

export default function Home() {
  const offers = [
    {
      id: 1,
      title: "Pomoc so záhradou",
      description:
        "Pomôžem s jarným upratovaním dvora, trávnika a výsadbou rastlín 🌱",
      image: Garden,
      author: "Ján Novák",
      location: "Bratislava",
      category: "Dobrovoľníctvo",
    },
    {
      id: 2,
      title: "Doučovanie angličtiny",
      description:
        "Ponúkam online aj osobné doučovanie angličtiny pre začiatočníkov 🇬🇧",
      image: Britain,
      author: "Mária Kováčová",
      location: "Košice",
      category: "Vzdelávanie",
    },
    {
      id: 3,
      title: "Pomoc seniorom s technológiami",
      description:
        "Pomôžem seniorom s používaním mobilu, počítača alebo internetu 💻",
      image: laptop,
      author: "Jozef Hrubý",
      location: "Trnava",
      category: "Dobrovoľníctvo",
    },
  ];

  const pins = [
    {
      id: 1,
      name: "Ján Novák",
      lat: 48.1486,
      lng: 17.1077,
      description: "Pomoc so záhradou",
    },
    {
      id: 2,
      name: "Mária Kováčová",
      lat: 48.7164,
      lng: 21.2611,
      description: "Doučovanie angličtiny",
    },
    {
      id: 3,
      name: "Jozef Hrubý",
      lat: 48.377,
      lng: 17.588,
      description: "Pomoc s technológiami",
    },
  ];

  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [topError, setTopError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [matchedUsers, setMatchedUsers] = useState<MatchedUser[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const res = await fetch("http://127.0.0.1:5000/api/activities?page_size=12");
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
  }, [currentUserId]);

  useEffect(() => {
    (async () => {
      try {
        setTopError(null);
        const res = await fetch("/api/users/top-rated?limit=6&days=7");
        if (!res.ok) throw new Error("Nepodarilo sa nacitat najlepsie hodnotenych");
        const data: TopUser[] = await res.json();
        setTopUsers(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setTopError(e.message || "Nepodarilo sa nacitat najlepsie hodnotenych");
      }
    })();
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-8 space-y-12">
        <h1 className="text-3xl font-bold text-center mb-10">
          🌉 Ponuky používateľov LifeBridge
        </h1>

        {/* === Carousel sekcia === */}
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
              {/* Šípky */}
              <button
                type="button"
                aria-label="Posun doľava"
                onClick={() => scrollBy(-1)}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center rounded-full bg-white/90 dark:bg-gray-800/90 shadow hover:bg-blue-600 hover:text-white transition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>

              <button
                type="button"
                aria-label="Posun doprava"
                onClick={() => scrollBy(1)}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center rounded-full bg-white/90 dark:bg-gray-800/90 shadow hover:bg-blue-600 hover:text-white transition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              {/* Carousel */}
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
                        <img
                          src={a.image_url}
                          alt={a.title}
                          className="w-full h-56 object-cover"
                        />
                      )}
                      <div className="p-4 space-y-2">
                        <h3 className="text-lg font-medium line-clamp-1">
                          {a.title}
                        </h3>
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
                {activities.length === 0 && (
                  <div className="text-gray-500 text-sm p-4">
                    Zatiaľ žiadne aktivity. Vytvor na stránke Blog.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-md p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Top zhody pre teba</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Ukazujeme profily s najvyssou zhodou z tvojho mesta.
              </p>
            </div>
            {currentUserId && (
              <Link
                to={`/users?matchFor=${currentUserId}`}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition"
              >
                Zobrazit dalsich
                <span aria-hidden="true">→</span>
              </Link>
            )}
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

        {/* === Mapa === */}
        <Map pins={pins} />

        {/* === Statické ponuky === */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {offers.map((offer) => (
            <Card
              key={offer.id}
              title={offer.title}
              description={offer.description}
              image={offer.image}
              author={offer.author}
              category={offer.category}
            />
          ))}
        </div>

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
          {topError ? (
            <p className="mt-4 text-sm text-red-500">{topError}</p>
          ) : topUsers.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              Zatiaľ nemáme dosť hodnotení pre zobrazenie rebríčka.
            </p>
          ) : (
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
                      <span aria-hidden="true">{"\u2605"}</span>
                      <span>{(user.avg_rating ?? 0).toFixed(1)}</span>
                      <span className="text-xs text-gray-500">({user.rating_count ?? 0})</span>
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
