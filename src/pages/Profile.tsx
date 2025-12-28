import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CardCreator from "../components/CardCreator";
import Card from "../components/Card";
import UserRatingsSection from "../components/UserRatingsSection";
import MainLayout from "../layouts/MainLayout";
import dobrovolnictvoImg from "../assets/dobrovolnictvo.png";
import vzdelavanieImg from "../assets/vzdelavanie.png";
import pomocSenioromImg from "../assets/pomoc_seniorom.png";
import spolocenskaAktivitaImg from "../assets/spolocenska_aktivita.png";
import ineImg from "../assets/ine.png";

type User = {
  id_user: number;
  meno: string;
  priezvisko: string;
  mail: string;
  datum_narodenia: string | null;
  mesto: string | null;
  about: string | null;
  rola?: string;
  created_at?: string;
};

type Post = {
  id_post: number;
  title: string;
  description: string;
  image?: string | null;
  category: string;
  name: string;
  surname: string;
};

type Hobby = {
  id_hobby: number;
  nazov: string;
  id_kategoria: number;
  kategoria_nazov?: string;
};

type Category = {
  id_kategoria: number;
  nazov: string;
  ikona?: string;
  pocet_hobby?: number;
};

type CitySuggestion = {
  display_name: string;
  lat: string;
  lon: string;
};

const ROLE_LABELS: Record<string, string> = {
  user_dobrovolnik: "Dobrovoľník",
  user_firma: "Firma",
  user_senior: "Dôchodca",
};

const formatRole = (role?: string | null) =>
  ROLE_LABELS[role ?? ""] || "Používateľ";

const categoryImageMap: Record<string, string> = {
  dobrovolnictvo: dobrovolnictvoImg,
  vzdelavanie: vzdelavanieImg,
  pomocseniorom: pomocSenioromImg,
  spolocenskaaktivita: spolocenskaAktivitaImg,
  ine: ineImg,
};

const normalizeCategory = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

const resolveImage = (post: Post) => {
  const provided = post.image?.trim();
  if (provided) return provided;
  const normalized = normalizeCategory(post.category || "");
  return categoryImageMap[normalized] ?? categoryImageMap.ine;
};

const onlyDate = (val: string | null | undefined): string => {
  if (!val) return "";
  const s = String(val).trim();
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return "";
};

export default function Profile() {
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);

  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [selectedHobbyIds, setSelectedHobbyIds] = useState<number[]>([]);
  const [editingHobbies, setEditingHobbies] = useState(false);
  const [savingHobbies, setSavingHobbies] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);

  const [form, setForm] = useState({
    meno: "",
    priezvisko: "",
    datum_narodenia: "",
    mesto: "",
    about: "",
  });

  // autocomplete na mesto
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [isLoadingCitySuggestions, setIsLoadingCitySuggestions] = useState(false);
  const cityDebounceRef = useRef<number | null>(null);
  const citySuggestionRef = useRef<HTMLDivElement | null>(null);
  const [cityInputValue, setCityInputValue] = useState("");
  const [cityValidated, setCityValidated] = useState(false);

  const baseUrl = useMemo(() => {
    const env = (import.meta as any).env?.VITE_API_URL ?? "";
    if (env) return env.replace(/\/$/, "");
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      if (origin.includes(":5173")) return origin.replace(":5173", ":5000");
      return origin;
    }
    return "";
  }, []);

  const currentUserId = useMemo<number | null>(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      const u = JSON.parse(raw);
      return u?.id ?? u?.id_user ?? null;
    } catch {
      return null;
    }
  }, []);

  const currentUserRole = useMemo<string | undefined>(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return undefined;
      const u = JSON.parse(raw);
      return u?.role;
    } catch {
      return undefined;
    }
  }, []);

  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const viewedUserId = useMemo<number | null>(() => {
    if (id) {
      const parsed = Number(id);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return currentUserId;
  }, [id, currentUserId]);

  const viewerIsAdmin =
    currentUserRole === "admin" || currentUserId === 1;
  const isOwnProfile =
    !!currentUserId && !!viewedUserId && currentUserId === viewedUserId;
  const canEditProfile = !!profile && (isOwnProfile || viewerIsAdmin);

  useEffect(() => {
    if (!viewedUserId) return;
    fetch(`/api/profile/${viewedUserId}`)
      .then((r) => r.json())
      .then((data) => {
        const normalized: User = {
          ...data,
          datum_narodenia: onlyDate(data.datum_narodenia) || null,
        };
        setProfile(normalized);
        setForm({
          meno: data.meno ?? "",
          priezvisko: data.priezvisko ?? "",
          datum_narodenia: onlyDate(data.datum_narodenia) || "",
          mesto: data.mesto ?? "",
          about: data.about ?? "",
        });
        setCityInputValue(data.mesto ?? "");
        setCityValidated(true); // existujúce mesto je validované
      })
      .catch((e) => console.error("Chyba pri načítaní profilu:", e));
  }, [viewedUserId, baseUrl]);

  useEffect(() => {
    if (!viewedUserId) return;
    (async () => {
      try {
        const [allRes, catsRes, userRes] = await Promise.all([
          fetch(`/api/hobbies`),
          fetch(`/api/hobby-categories`),
          fetch(`/api/profile/${viewedUserId}/hobbies`),
        ]);
        if (allRes.ok) setHobbies((await allRes.json()) || []);
        if (catsRes.ok) setCategories((await catsRes.json()) || []);
        if (userRes.ok) {
          const mine = await userRes.json();
          setSelectedHobbyIds((mine || []).map((h: any) => h.id_hobby));
        } else {
          setSelectedHobbyIds([]);
        }
      } catch {
        setSelectedHobbyIds([]);
      }
    })();
  }, [viewedUserId, baseUrl]);

  const toggleHobby = (id: number) => {
    if (!canEditProfile) return;
    setSelectedHobbyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSaveHobbies = async () => {
    if (!viewedUserId || !canEditProfile) return;
    setSavingHobbies(true);
    try {
      const res = await fetch(
        `/api/profile/${viewedUserId}/hobbies`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hobbies: selectedHobbyIds }),
        }
      );
      if (!res.ok) {
        alert(await res.text());
        return;
      }
      setEditingHobbies(false);
    } catch {
      alert("Nepodarilo sa uložiť záľuby.");
    } finally {
      setSavingHobbies(false);
    }
  };

  const fetchMyPosts = async () => {
    if (!viewedUserId) return;
    try {
      const res = await fetch(
        `/api/posts?author_id=${viewedUserId}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const items: Post[] = Array.isArray(data) ? data : data.items ?? [];
      setPosts(items ?? []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchMyPosts();
  }, [viewedUserId, baseUrl]);

  const postsLoadedRef = useRef(false);
  useEffect(() => {
    if (viewedUserId && !postsLoadedRef.current) {
      postsLoadedRef.current = true;
      fetchMyPosts();
    }
  }, [viewedUserId]);

  const toAbsolute = (url?: string | null) =>
    url ? `${baseUrl}${url}` : null;

  useEffect(() => {
    if (!viewedUserId) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/profile/${viewedUserId}/avatar`
        );
        if (!res.ok) {
          setAvatarSrc(null);
          return;
        }
        const data = await res.json();
        setAvatarSrc(toAbsolute(data?.url));
      } catch {
        setAvatarSrc(null);
      }
    })();
  }, [viewedUserId, baseUrl]);

  const fullName = useMemo(() => {
    if (!profile) return "";
    return `${profile.meno ?? ""} ${profile.priezvisko ?? ""}`.trim();
  }, [profile?.meno, profile?.priezvisko]);

  const roleText = useMemo(
    () => formatRole(profile?.rola),
    [profile?.rola]
  );

  const initials = useMemo(() => {
    const first = profile?.meno?.trim()?.[0] ?? "";
    const last = profile?.priezvisko?.trim()?.[0] ?? "";
    const combo = `${first}${last}`.trim();
    if (combo) return combo.toUpperCase();
    const fallback = (profile?.meno ?? profile?.priezvisko ?? "").trim();
    return (fallback[0] || "?").toUpperCase();
  }, [profile?.meno, profile?.priezvisko]);

  const avatarAlt = fullName || profile?.mail || "Profilová fotka";

  const AvatarCircle = ({
    sizeClass = "w-32 h-32",
    textClass = "text-3xl",
    borderClass = "border-4 border-blue-600 dark:border-indigo-400 shadow",
  }: {
    sizeClass?: string;
    textClass?: string;
    borderClass?: string;
  }) => {
    if (avatarSrc) {
      return (
        <img
          src={avatarSrc}
          alt={avatarAlt}
          className={`${sizeClass} rounded-full object-cover ${borderClass}`}
        />
      );
    }
    return (
      <div
        className={`${sizeClass} rounded-full ${borderClass} bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold ${textClass}`}
        aria-label={avatarAlt}
      >
        {initials}
      </div>
    );
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        citySuggestionRef.current &&
        !citySuggestionRef.current.contains(e.target as Node)
      ) {
        setShowCitySuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchCitySuggestions = async (query: string) => {
    setIsLoadingCitySuggestions(true);
    try {
      const url =
        "https://nominatim.openstreetmap.org/search" +
        `?q=${encodeURIComponent(query)}` +
        "&format=json&limit=8&addressdetails=1&accept-language=sk";

      const res = await fetch(url, {
        headers: {
          "User-Agent": "LifeBridge App",
        },
      });

      if (!res.ok) {
        setCitySuggestions([]);
        setShowCitySuggestions(false);
        return;
      }

      const data = await res.json();
      if (!data || data.length === 0) {
        setCitySuggestions([]);
        setShowCitySuggestions(false);
        return;
      }

      const formatted: CitySuggestion[] = data.map((item: any) => {
        const addr = item.address || {};
        const cityName =
          addr.city || addr.town || addr.village || item.display_name;
        const country = addr.country ? `, ${addr.country}` : "";
        return {
          display_name: `${cityName}${country}`,
          lat: item.lat,
          lon: item.lon,
        };
      });

      setCitySuggestions(formatted);
      setShowCitySuggestions(formatted.length > 0);
    } catch (e) {
      console.error("Chyba pri načítaní návrhov mesta:", e);
      setCitySuggestions([]);
      setShowCitySuggestions(false);
    } finally {
      setIsLoadingCitySuggestions(false);
    }
  };

  const handleCityInputChange = (value: string) => {
    setCityInputValue(value);
    setCityValidated(false); // resetuj validáciu pri zmene
    if (cityDebounceRef.current) {
      window.clearTimeout(cityDebounceRef.current);
    }
    if (value.trim().length < 2) {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      return;
    }
    cityDebounceRef.current = window.setTimeout(() => {
      fetchCitySuggestions(value);
    }, 500);
  };

  const handleCitySuggestionClick = (s: CitySuggestion) => {
    const parts = s.display_name.split(",");
    const cityOnly = parts[0].trim();
    setForm((f) => ({ ...f, mesto: cityOnly }));
    setCityInputValue(cityOnly);
    setCityValidated(true); // označíme ako validované
    setShowCitySuggestions(false);
    setCitySuggestions([]);
  };

  const handleSave = async () => {
    if (!profile || !canEditProfile) return;
    
    if (!cityValidated || !form.mesto || form.mesto.trim().length === 0) {
      alert("Mesto je povinné. Vyberte mesto zo zoznamu návrhov.");
      return;
    }

    setSaving(true);
    try {
      const changed: Record<string, any> = {};
      const orig = profile;
      const cmp = (v: any) => (v == null ? "" : String(v));

      if (cmp(form.meno) !== cmp(orig.meno)) changed.meno = form.meno;
      if (cmp(form.priezvisko) !== cmp(orig.priezvisko))
        changed.priezvisko = form.priezvisko;
      if (
        cmp(form.datum_narodenia) !==
        cmp(onlyDate(orig.datum_narodenia))
      )
        changed.datum_narodenia = form.datum_narodenia || null;
      if (cmp(form.mesto) !== cmp(orig.mesto))
        changed.mesto = form.mesto || null;
      if (cmp(form.about) !== cmp(orig.about))
        changed.about = form.about || null;

      if (Object.keys(changed).length === 0) {
        setIsEditing(false);
        return;
      }

      const res = await fetch(`/api/profile/${profile.id_user}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changed),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "Nepodarilo sa uložiť profil.");
      } else {
        const normalized: User = {
          ...data,
          datum_narodenia: onlyDate(data.datum_narodenia) || null,
        };
        setProfile(normalized);
        setIsEditing(false);
      }
    } catch (e) {
      alert("Chyba siete pri ukladaní profilu.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!profile || !viewerIsAdmin || isOwnProfile) return;
    if (
      !window.confirm(
        `Naozaj chceš zmazať profil používateľa ${profile.meno} ${profile.priezvisko}?`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/users/${profile.id_user}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error || "Nepodarilo sa zmazať používateľa.");
        return;
      }
      alert("Profil bol zmazaný.");
      navigate("/users");
    } catch (e) {
      alert("Chyba siete pri mazaní používateľa.");
    }
  };

  const handleAddPost = async (postData: {
    title: string;
    description: string;
    image?: string | null;
    category: string;
  }) => {
    if (!currentUserId) return alert("Musíš byť prihlásený!");
    if (!viewedUserId || !canEditProfile) {
      alert("Nemáš oprávnenie pridávať príspevky k tomuto profilu.");
      return;
    }
    const payload = { ...postData, user_id: viewedUserId };
    try {
      const res = await fetch(`/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setIsCreating(false);
        await fetchMyPosts();
      } else {
        console.error(
          "Nepodarilo sa vytvoriť príspevok:",
          await res.text()
        );
      }
    } catch (e) {
      console.error("Chyba siete pri vytváraní príspevku", e);
    }
  };

  const handleEditPost = async (postData: {
    title: string;
    description: string;
    image?: string | null;
    category: string;
  }) => {
    if (!editingPost || !canEditProfile) return;
    try {
      const res = await fetch(`/api/posts/${editingPost.id_post}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...postData, id_post: editingPost.id_post }),
      });
      if (res.ok) {
        setIsEditingPost(false);
        setEditingPost(null);
        await fetchMyPosts();
      } else {
        console.error(
          "Nepodarilo sa upraviť príspevok:",
          await res.text()
        );
      }
    } catch (e) {
      console.error("Chyba siete pri úprave príspevku", e);
    }
  };

  const handleDeletePost = async (id: number) => {
    if (!canEditProfile) return;
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: "DELETE",
      });
      if (res.ok) await fetchMyPosts();
    } catch {
      // ignore
    }
  };

  if (!viewedUserId) {
    return (
      <MainLayout>
        <div className="max-w-xl mx-auto p-8">
          <p className="text-center text-gray-500">
            Najprv sa prihlás alebo zadaj platný profil.
          </p>
        </div>
      </MainLayout>
    );
  }

  const postsTitle = isOwnProfile ? "Moje príspevky" : "Príspevky používateľa";

  return (
    <MainLayout>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100">
        <div className="max-w-4xl mx-auto p-8">
          {/* Profilová hlavička */}
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-8 flex flex-col items-center text-center space-y-4">
            <AvatarCircle />
            <h2 className="text-2xl font-bold">{fullName}</h2>

            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-semibold">{roleText}</span>
              {profile?.mail && <span>• {profile.mail}</span>}
            </div>

            <div className="flex flex-wrap gap-3 justify-center mt-2">
              <button
                onClick={() => canEditProfile && setIsEditing(true)}
                className={`px-5 py-2 rounded-lg transition ${
                  canEditProfile
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-300 text-gray-600 cursor-not-allowed"
                }`}
                disabled={!canEditProfile}
              >
                Upraviť profil
              </button>

              {viewerIsAdmin && profile && !isOwnProfile && (
                <button
                  onClick={handleDeleteProfile}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm"
                >
                  Zmazať profil
                </button>
              )}
            </div>
          </div>

          {/* Záľuby */}
          <div className="mt-6 bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Záľuby</h3>
              {canEditProfile && (
                <button
                  onClick={() => setEditingHobbies((v) => !v)}
                  className="text-sm px-3 py-1 rounded-md border hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {editingHobbies ? "Zrušiť" : "Upraviť záľuby"}
                </button>
              )}
            </div>

            {!editingHobbies ? (
              selectedHobbyIds.length === 0 ? (
                <p className="text-gray-500">Zatiaľ nevybrané.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedHobbyIds.map((id) => {
                    const h = hobbies.find((x) => x.id_hobby === id);
                    return (
                      <span
                        key={id}
                        className="px-2 py-1 text-sm rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                      >
                        {h?.nazov || id}
                      </span>
                    );
                  })}
                </div>
              )
            ) : (
              <div>
                {/* Filter kategórií */}
                <div className="flex flex-wrap gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      selectedCategory === null
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    Všetko
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id_kategoria}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id_kategoria)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                        selectedCategory === cat.id_kategoria
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      }`}
                    >
                      {(cat.ikona || "")}{" "}
                      {cat.nazov.replace(/^.+ /, "")}
                    </button>
                  ))}
                </div>

                {/* Hobby Pills */}
                <div className="flex flex-wrap gap-2 p-1 max-h-72 overflow-y-auto">
                  {(selectedCategory
                    ? hobbies.filter(
                        (h) => h.id_kategoria === selectedCategory
                      )
                    : hobbies
                  ).map((hobby) => (
                    <button
                      key={hobby.id_hobby}
                      type="button"
                      onClick={() => toggleHobby(hobby.id_hobby)}
                      className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
                        selectedHobbyIds.includes(hobby.id_hobby)
                          ? "bg-blue-600 text-white shadow-md transform scale-105"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      }`}
                    >
                      {hobby.nazov}
                    </button>
                  ))}
                </div>

                {canEditProfile && (
                  <div className="mt-3 flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingHobbies(false)}
                      className="px-3 py-1 rounded-md border"
                    >
                      Zrušiť
                    </button>
                    <button
                      onClick={handleSaveHobbies}
                      disabled={savingHobbies}
                      className="px-4 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      {savingHobbies ? "Ukladám…" : "Uložiť záľuby"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sekcia s informáciami */}
          <div className="mt-10 grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-3">
                Základné údaje
              </h3>
              <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                <li>
                  Rola: <span className="font-semibold">{roleText}</span>
                </li>
                <li>Mesto: {profile?.mesto?.trim() || "Neuvedené"}</li>
                <li>
                  Dátum narodenia:{" "}
                  {profile?.datum_narodenia
                    ? String(profile.datum_narodenia)
                    : "Neuvedené"}
                </li>
                <li>E-mail: {profile?.mail ?? ""}</li>
              </ul>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-3">O mne</h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed break-words">
                {profile?.about?.trim()
                  ? profile.about
                  : "Zatiaľ bez popisu."}
              </p>
            </div>
          </div>

          {/* Príspevky používateľa */}
          <div className="mt-10 bg-white dark:bg-gray-800 rounded-2xl shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{postsTitle}</h3>
              {canEditProfile && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
                >
                  ➕ Pridať príspevok
                </button>
              )}
            </div>

            {posts.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 italic">
                Zatiaľ žiadne príspevky.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.map((p) => (
                  <div key={p.id_post} className="relative group">
                    <Card
                      title={p.title}
                      description={p.description}
                      image={resolveImage(p)}
                      author={`${p.name} ${p.surname}`}
                      category={p.category}
                      onClick={() => navigate(`/posts/${p.id_post}`)}
                    />
                    {canEditProfile && (
                      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => {
                            setEditingPost(p);
                            setIsEditingPost(true);
                          }}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-2 py-1 rounded-md"
                        >
                          Upraviť
                        </button>
                        <button
                          onClick={() => handleDeletePost(p.id_post)}
                          className="bg-red-500 hover:bg-red-600 text-white text-sm px-2 py-1 rounded-md"
                        >
                          Zmazať
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hodnotenia používateľa */}
          <UserRatingsSection
            userId={viewedUserId ?? undefined}
            currentUserId={currentUserId}
            baseUrl={baseUrl}
            showRateButton={false}
            pageSize={5}
            className="mt-10"
          />
        </div>

        {/* Editor profilu (modal) */}
        {isEditing && profile && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-4">
                Upraviť profil
              </h3>

              <div className="grid grid-cols-1 gap-4">
                {/* Avatar upload */}
                <div>
                  <label className="block text-sm mb-1">
                    Profilová fotka
                  </label>
                  <div className="flex items-center gap-4">
                    <AvatarCircle
                      sizeClass="w-16 h-16"
                      textClass="text-lg"
                      borderClass="border border-gray-300 dark:border-gray-600"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        if (!profile || !canEditProfile) return;
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.append("file", file);
                        try {
                          const res = await fetch(
                            `/api/profile/${profile.id_user}/avatar`,
                            { method: "POST", body: fd }
                          );
                          const data = await res.json();
                          if (!res.ok)
                            throw new Error(
                              data?.error || "Upload zlyhal"
                            );
                          if (data?.url)
                            setAvatarSrc(toAbsolute(data.url));
                        } catch (err) {
                          alert("Nepodarilo sa nahrať avatar.");
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1">Meno</label>
                    <input
                      className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900"
                      value={form.meno}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, meno: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">
                      Priezvisko
                    </label>
                    <input
                      className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900"
                      value={form.priezvisko}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          priezvisko: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1">
                      Dátum narodenia
                    </label>
                    <input
                      type="date"
                      className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900"
                      value={form.datum_narodenia || ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          datum_narodenia: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="relative" ref={citySuggestionRef}>
                    <label className="block text-sm mb-1">
                      Mesto * 
                      {!cityValidated && cityInputValue && (
                        <span className="text-red-500 text-xs ml-2">
                          (Vyberte zo zoznamu)
                        </span>
                      )}
                    </label>
                    <input
                      className={`w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 ${
                        !cityValidated && cityInputValue
                          ? "border-red-500"
                          : ""
                      }`}
                      value={cityInputValue}
                      onChange={(e) => handleCityInputChange(e.target.value)}
                      onFocus={() =>
                        citySuggestions.length > 0 &&
                        setShowCitySuggestions(true)
                      }
                      autoComplete="off"
                      placeholder="Začni písať mesto..."
                      required
                    />

                    {isLoadingCitySuggestions && (
                      <div className="absolute right-3 top-9 text-gray-400">
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      </div>
                    )}

                    {showCitySuggestions && citySuggestions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {citySuggestions.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() =>
                              handleCitySuggestionClick(s)
                            }
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 last:border-b-0 text-sm"
                          >
                            📍 {s.display_name}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {cityValidated
                        ? "✓ Mesto vybrané zo zoznamu"
                        : "Vyberte mesto zo zoznamu návrhov"}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-1">O mne</label>
                  <textarea
                    rows={5}
                    className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900"
                    value={form.about}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, about: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    // resetuj validáciu pri zrušení
                    setCityInputValue(profile.mesto ?? "");
                    setCityValidated(true);
                  }}
                  className="px-4 py-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-700"
                  disabled={saving}
                >
                  Zrušiť
                </button>
                <button
                  onClick={handleSave}
                  className={`px-5 py-2 rounded-lg text-white ${
                    cityValidated && form.mesto
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                  disabled={saving || !cityValidated || !form.mesto}
                >
                  {saving ? "Ukladám…" : "Uložiť"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CardCreator modaly */}
        {isCreating && (
          <CardCreator
            onClose={() => setIsCreating(false)}
            onSave={handleAddPost}
          />
        )}
        {isEditingPost && editingPost && (
          <CardCreator
            onClose={() => {
              setIsEditingPost(false);
              setEditingPost(null);
            }}
            onSave={handleEditPost}
            initialData={{
              ...editingPost,
              image: editingPost.image ?? undefined,
            }}
          />
        )}
      </div>
    </MainLayout>
  );
}
