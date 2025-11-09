import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Send, MessageCircle, X, ChevronDown, Mic, MicOff, Volume2, VolumeX, Globe } from "lucide-react";

/**
 * LifeBridge – On‑site Chatbot (client‑only, + hlas, + dynamické vedomosti)
 * ------------------------------------------------------------------------
 * Účel: Pomáha používateľom zorientovať sa na webe (kde je prihlásenie,
 * registrácia, profil, ponuky, používatelia, atď.) a po novom:
 *  - vie čítať nahlas odpovede (TTS)
 *  - vie počúvať hlasový vstup (ASR – Web Speech API)
 *  - načíta si dynamicky znalosti zo servera (/api/site-map, /api/offers)
 *
 * Implementácia: čisto frontend (React/TS), bez API kľúčov.
 * Integrácia: vložte <ChatbotWidget /> do MainLayout (alebo App.tsx),
 * aby bol dostupný na všetkých stránkach.
 */

// --------- Typy ---------

// --- Web Speech API type definitions (fix for TypeScript) ---

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;

  start(): void;
  stop(): void;

  // Handlery
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: (() => void) | null; // pridané manuálne

  // Doplnkové vlastnosti (nie sú vždy dostupné)
  continuous?: boolean;
  grammars?: any;
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
  readonly resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

declare var webkitSpeechRecognition: {
  new (): SpeechRecognition;
};



type RouteInfo = {
  path: string;
  label: string;
  short: string[]; // synonymá/klúčové slová
  description: string;
};

type QA = {
  q: string[]; // možné formulácie otázky
  a: string; // odpoveď
};

type Offer = {
  id?: number;
  title: string;
  description?: string;
  location?: string;
  category?: string;
};

// --------- Základná (fallback) konfigurácia znalostí o webe ---------

const FALLBACK_ROUTES: RouteInfo[] = [
  {
    path: "/",
    label: "Domov",
    short: ["domov", "home", "ponuky", "karty", "lifebridge", "hlavna strana", "úvodná"],
    description:
      "Prehľad ponúk používateľov (karty s titulkom, popisom, autorom, lokalitou a kategóriou).",
  },
  {
    path: "/login",
    label: "Prihlásenie",
    short: ["login", "prihlasenie", "prihlasit", "prihlasit sa", "sign in", "signin"],
    description: "Formulár na prihlásenie – email + heslo.",
  },
  {
    path: "/register",
    label: "Registrácia",
    short: [
      "register",
      "registracia",
      "registrácia",
      "sign up",
      "signup",
      "vytvorit ucet",
      "novy ucet",
      "nový účet",
    ],
    description: "Formulár na vytvorenie účtu – meno, priezvisko, email, heslo, dátum narodenia.",
  },
  {
    path: "/profile",
    label: "Profil",
    short: ["profil", "moj profil", "môj profil", "account", "účet", "ucet"],
    description:
      "Informácie o používateľovi + priestor na tvorbu vlastných ponúk (karty).",
  },
  {
    path: "/users",
    label: "Používatelia",
    short: ["používatelia", "uzivatelia", "users", "zoznam uzivatelov", "zoznam používateľov"],
    description: "Zoznam používateľov načítaný z backendu /api/users.",
  },
];

const FALLBACK_FAQ: QA[] = [
  {
    q: ["kde sa prihlásim", "ako sa prihlásiť", "kde je login", "login", "prihlasenie"],
    a: "Na prihlásenie choď na stránku Prihlásenie. Klikni na tlačidlo nižšie alebo použi horné menu.",
  },
  {
    q: ["kde sa zaregistrujem", "ako si vytvorím účet", "registrácia", "sign up"],
    a: "Účet si vytvoríš na stránke Registrácia. Vyplň všetky polia a odošli formulár.",
  },
  {
    q: ["kde nájdem ponuky", "karty", "domov", "home", "čo je na úvodnej"],
    a: "Ponuky zobrazujeme na domovskej stránke. Nájdeš tam karty s titulkom, popisom a autorom.",
  },
  { q: ["kde je môj profil", "profil", "account", "účet"], a: "Tvoj profil je na stránke Profil. Odtiaľ vieš tvoriť vlastné ponuky." },
  { q: ["kde vidím všetkých používateľov", "users", "zoznam účtov"], a: "Zoznam používateľov je na stránke Používatelia (dáta z /api/users)." },
];

// --------- i18n (minimal) ---------

type Lang = "sk" | "en";
const STR = {
  sk: {
    assistant: "LifeBridge Asistent",
    currentPage: "Aktuálna stránka",
    hello: (name?: string) => `${name ? `Ahoj ${name}!` : "Ahoj!"} Som asistent LifeBridge. Spýtaj sa, kde nájdeš prihlásenie, registráciu, profil, ponuky alebo zoznam používateľov.`,
    goTo: (label: string) => `Prejsť na ${label}`,
    opening: (label: string, desc: string) => `Jasné! Otváram ${label} – ${desc}`,
    fallback: `Zatiaľ si s týmto dotazom neviem rady 🤔 Skús prosím spomenúť, či chceš prihlásenie, registráciu, profil, ponuky alebo používateľov.`,
    inputPh: "Spýtaj sa: kde je prihlásenie…",
    quick: { login: "Prihlásenie", register: "Registrácia", profile: "Profil", offers: "Ponuky", users: "Používatelia" },
    ttsOn: "Čítanie zapnuté",
    ttsOff: "Čítanie vypnuté",
    micOn: "Počúvam… hovor teraz",
    micOff: "Mikrofón vypnutý",
  },
  en: {
    assistant: "LifeBridge Assistant",
    currentPage: "Current page",
    hello: (name?: string) => `${name ? `Hi ${name}!` : "Hi!"} I'm the LifeBridge assistant. Ask me where to find login, registration, profile, offers or users list.`,
    goTo: (label: string) => `Go to ${label}`,
    opening: (label: string, desc: string) => `Sure! Opening ${label} – ${desc}`,
    fallback: `I'm not sure yet 🤔 Try mentioning login, registration, profile, offers or users.`,
    inputPh: "Ask: where is login…",
    quick: { login: "Login", register: "Register", profile: "Profile", offers: "Offers", users: "Users" },
    ttsOn: "Reading on",
    ttsOff: "Reading off",
    micOn: "Listening… speak now",
    micOff: "Mic off",
  },
} as const;

// --------- Pomocné funkcie (fuzzy matching) ---------

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function score(haystack: string, needles: string[]) {
  const h = norm(haystack);
  let sc = 0;
  for (const n of needles) {
    const nn = norm(n);
    if (nn && h.includes(nn)) sc += nn.length; // dlhšie zhody = vyššia váha
  }
  return sc;
}

function bestRouteFor(text: string, routes: RouteInfo[]): RouteInfo | null {
  let best: { r: RouteInfo; s: number } | null = null;
  for (const r of routes) {
    const s = score(text, [r.label, ...r.short]);
    if (!best || s > best.s) best = { r, s };
  }
  if (!best || best.s === 0) return null;
  return best.r;
}

function bestFAQFor(text: string, faq: QA[]): QA | null {
  let best: { qa: QA; s: number } | null = null;
  for (const qa of faq) {
    const s = score(text, qa.q);
    if (!best || s > best.s) best = { qa, s };
  }
  if (!best || best.s === 0) return null;
  return best.qa;
}

function bestOfferFor(text: string, offers: Offer[]): Offer | null {
  const h = norm(text);
  let best: { o: Offer; s: number } | null = null;
  for (const o of offers) {
    const keys = [o.title, o.description || "", o.location || "", o.category || ""].filter(Boolean) as string[];
    const s = score(h, keys);
    if (!best || s > best.s) best = { o, s };
  }
  if (!best || best.s === 0) return null;
  return best.o;
}

// --------- Web Speech API helpers ---------

type SRType = typeof window extends any ? (SpeechRecognition & { lang: string }) : any;

const getRecognition = (): SpeechRecognition | null => {
  const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec: SpeechRecognition = new SR();
  rec.lang = document.documentElement.lang?.startsWith("en") ? "en-US" : "sk-SK";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  return rec;
};

const speak = (text: string, lang: Lang) => {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "en" ? "en-US" : "sk-SK";
  // Nevyberaj explicitný hlas – nechaj na OS.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
};

// --------- UI komponent: bublina správy ---------

function Bubble({ from, children }: { from: "bot" | "me"; children: React.ReactNode }) {
  const isBot = from === "bot";
  return (
    <div className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-md ${
          isBot
            ? "bg-white/90 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
            : "bg-blue-600 text-white"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// --------- Hlavný widget ---------

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<React.ReactNode[]>([]);
  const [routes, setRoutes] = useState<RouteInfo[]>(FALLBACK_ROUTES);
  const [faq, setFaq] = useState<QA[]>(FALLBACK_FAQ);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [lang, setLang] = useState<Lang>("sk");
  const [tts, setTts] = useState(false);
  const [listening, setListening] = useState(false);
  const [recSupported, setRecSupported] = useState<boolean>(false);

  const navigate = useNavigate();
  const location = useLocation();
  const listRef = useRef<HTMLDivElement>(null);

  // podpora rozpoznávania reči
  useEffect(() => {
    setRecSupported(!!getRecognition());
  }, []);

  // načítanie dynamických znalostí
  useEffect(() => {
    (async () => {
      try {
        const [siteMapRes, offersRes] = await Promise.all([
          fetch("/api/site-map").catch(() => null),
          fetch("/api/offers?limit=50").catch(() => null),
        ]);
        if (siteMapRes && siteMapRes.ok) {
          const sm = await siteMapRes.json();
          // očakávaný tvar: [{ path, label, description, short: [] }]
          if (Array.isArray(sm) && sm.length) setRoutes(sm);
        }
        if (offersRes && offersRes.ok) {
          const of = await offersRes.json();
          if (Array.isArray(of)) setOffers(of);
        }
      } catch (_) {
        // fallback ostáva
      }
    })();
  }, []);

  const userName = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      const u = JSON.parse(raw);
      return u?.name || null;
    } catch (_) {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // uvítacia správa
  useEffect(() => {
    if (messages.length > 0) return;
    setMessages([
      <Bubble from="bot" key="hello">
        <div className="space-y-2">
          <p>{STR[lang].hello(userName || undefined)}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {routes.map((r) => (
              <button
                key={r.path}
                onClick={() => handleNavigate(r)}
                className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </Bubble>,
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function say(text: string) {
    if (tts) speak(text, lang);
  }

  function handleNavigate(r: RouteInfo) {
    const text = STR[lang].opening(r.label, r.description);
    setMessages((prev) => [
      ...prev,
      <Bubble from="bot" key={`nav-${r.path}-${Date.now()}`}>
        <div className="space-y-1">
          <p>{text}</p>
          <button
            onClick={() => navigate(r.path)}
            className="mt-1 inline-flex items-center gap-1 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md"
          >
            {STR[lang].goTo(r.label)}
          </button>
        </div>
      </Bubble>,
    ]);
    say(text);
  }

  function reply(text: string) {
    const qa = bestFAQFor(text, faq);
    const route = bestRouteFor(text, routes);
    const offer = offers.length ? bestOfferFor(text, offers) : null;

    if (qa) {
      const suggested = route ?? routes[0];
      setMessages((prev) => [
        ...prev,
        <Bubble from="bot" key={`faq-${Date.now()}`}>
          <div className="space-y-2">
            <p>{qa.a}</p>
            {suggested && (
              <button
                onClick={() => navigate(suggested.path)}
                className="inline-flex items-center gap-1 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md"
              >
                {STR[lang].goTo(suggested.label)}
              </button>
            )}
          </div>
        </Bubble>,
      ]);
      say(qa.a);
      return;
    }

    if (offer) {
      const textOffer = `${lang === "en" ? "I found an offer:" : "Našiel som ponuku:"} ${offer.title}${offer.location ? (lang === "en" ? ` in ${offer.location}` : ` v ${offer.location}`) : ""}.`;
      setMessages((prev) => [
        ...prev,
        <Bubble from="bot" key={`offer-${Date.now()}`}>
          <div className="space-y-1">
            <p>{textOffer}</p>
            <button
              onClick={() => navigate("/")}
              className="mt-1 inline-flex items-center gap-1 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md"
            >
              {lang === "en" ? "Go to offers" : "Prejsť na ponuky"}
            </button>
          </div>
        </Bubble>,
      ]);
      say(textOffer);
      return;
    }

    if (route) {
      handleNavigate(route);
      return;
    }

    const fb = STR[lang].fallback;
    setMessages((prev) => [
      ...prev,
      <Bubble from="bot" key={`fallback-${Date.now()}`}>
        <div className="space-y-2">
          <p>{fb}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {routes.map((r) => (
              <button
                key={`sugg-${r.path}`}
                onClick={() => handleNavigate(r)}
                className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </Bubble>,
    ]);
    say(fb);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, <Bubble from="me" key={`me-${Date.now()}`}>{text}</Bubble>]);
    setInput("");
    setTimeout(() => reply(text), 100);
  }

  function toggleMic() {
    if (listening) {
      (window as any)._rec?.stop?.();
      setListening(false);
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    (window as any)._rec = rec;
    try {
      rec.onresult = (e: any) => {
        const text = e.results?.[0]?.[0]?.transcript || "";
        if (text) {
          setMessages((prev) => [...prev, <Bubble from="me" key={`me-voice-${Date.now()}`}>{text}</Bubble>]);
          setTimeout(() => reply(text), 80);
        }
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  return (
    <div className="fixed z-50 bottom-4 right-4">
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Otvoriť chat"
          className="rounded-full shadow-lg p-4 bg-blue-600 text-white hover:bg-blue-700"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="w-[380px] max-w-[92vw] h-[560px] flex flex-col rounded-2xl shadow-2xl bg-white/95 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
            <div className="flex items-center gap-2">
              <div className="font-semibold">{STR[lang].assistant}</div>
              <button
                onClick={() => setLang((p) => (p === "sk" ? "en" : "sk"))}
                className="ml-2 p-1 rounded bg-white/15 hover:bg-white/25"
                title="Switch language"
                aria-label="Switch language"
              >
                <Globe className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {/* TTS toggle */}
              <button
                onClick={() => setTts((v) => !v)}
                className="p-1 rounded bg-white/15 hover:bg-white/25"
                title={tts ? STR[lang].ttsOff : STR[lang].ttsOn}
                aria-label="Toggle reading"
              >
                {tts ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              {/* Mic */}
              <button
                onClick={toggleMic}
                disabled={!recSupported}
                className={`p-1 rounded ${listening ? "bg-red-500/70" : "bg-white/15 hover:bg-white/25"} ${!recSupported ? "opacity-40 cursor-not-allowed" : ""}`}
                title={listening ? STR[lang].micOn : STR[lang].micOff}
                aria-label="Toggle microphone"
              >
                {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button onClick={() => setOpen(false)} aria-label="Zavrieť chat" className="p-1 rounded hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div ref={listRef} className="flex-1 p-3 space-y-3 overflow-y-auto bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
            {/* Info bar */}
            <div className="text-[11px] text-gray-500 dark:text-gray-400 px-1">{STR[lang].currentPage}: {location.pathname}</div>
            {messages}
          </div>

          {/* Quick actions */}
          <div className="px-3 pb-2 pt-1 border-t border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/60">
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
              <QuickAction label={STR[lang].quick.login} onClick={() => reply(lang === "en" ? "where is login" : "kde je prihlásenie")} />
              <QuickAction label={STR[lang].quick.register} onClick={() => reply(lang === "en" ? "registration" : "registrácia")} />
              <QuickAction label={STR[lang].quick.profile} onClick={() => reply(lang === "en" ? "where is my profile" : "kde je môj profil")} />
              <QuickAction label={STR[lang].quick.offers} onClick={() => reply(lang === "en" ? "offers" : "kde nájdem ponuky")} />
              <QuickAction label={STR[lang].quick.users} onClick={() => reply(lang === "en" ? "users" : "používatelia")} />
            </div>
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={STR[lang].inputPh}
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
    >
      {label}
    </button>
  );
}
