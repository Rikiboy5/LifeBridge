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
      </div>
    </MainLayout>
  );
}
