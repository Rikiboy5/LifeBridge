
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Send, MessageCircle, X, ChevronDown, Volume2, VolumeX } from "lucide-react";

/**
 * LifeBridge – Chatbot (voice + i18n + dynamic knowledge + accessible mic)
 * v2-fix:
 * - Added missing STR entries: foundOffer, offersGo (SK/EN).
 * - Keeps all v2 improvements (speak on open, removed header mic, persisted language, dropdown).
 */

// --------- Web Speech API typy ---------

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;

  start(): void;
  stop(): void;

  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: (() => void) | null;

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

// --------- Typy ---------

type Lang = "sk" | "en";

type RouteInfo = {
  path: string;
  label: string;
  short: string[]; // synonymá/keywords
  description: string;
};

type QA = {
  q: string[];   // formulácie otázky (SK aj EN)
  a_sk: string;  // odpoveď po slovensky
  a_en: string;  // odpoveď po anglicky
};

type Offer = {
  id?: number;
  title: string;
  description?: string;
  location?: string;
  category?: string;
};

type RecStatus = "idle" | "listening" | "done" | "error";

// --------- i18n texty UI ---------

const STR = {
  sk: {
    assistant: "LifeBridge Asistent",
    currentPage: "Aktuálna stránka",
    hello: (name?: string) =>
      `${name ? `Ahoj ${name}!` : "Ahoj!"} Som asistent LifeBridge. Spýtaj sa, kde nájdeš prihlásenie, registráciu, profil, ponuky alebo zoznam používateľov.`,
    goTo: (label: string) => `Prejsť na ${label}`,
    opening: (label: string, desc: string) => `Jasné! Otváram ${label} – ${desc}`,
    fallback:
      `Zatiaľ si s týmto dotazom neviem rady 🤔 Skús prosím spomenúť, či chceš prihlásenie, registráciu, profil, ponuky alebo používateľov.`,
    inputPh: "Spýtaj sa: kde je prihlásenie…",
    quick: { login: "Prihlásenie", register: "Registrácia", profile: "Profil", offers: "Ponuky", users: "Používatelia" },
    ttsOn: "Čítanie zapnuté",
    ttsOff: "Čítanie vypnuté",
    speakBtn: "🎤 Hovoriť",
    listening: "Počúvam...",
    done: "Hotovo!",
    error: "Chyba mikrofónu",
    langLabel: "Jazyk",
    foundOffer: (title: string, loc?: string) => `Našiel som ponuku: ${title}${loc ? ` v ${loc}` : ""}.`,
    offersGo: "Prejsť na ponuky",
  },
  en: {
    assistant: "LifeBridge Assistant",
    currentPage: "Current page",
    hello: (name?: string) =>
      `${name ? `Hi ${name}!` : "Hi!"} I'm the LifeBridge assistant. Ask me where to find login, registration, profile, offers or the users list.`,
    goTo: (label: string) => `Go to ${label}`,
    opening: (label: string, desc: string) => `Sure! Opening ${label} – ${desc}`,
    fallback:
      `I'm not sure yet 🤔 Try mentioning login, registration, profile, offers or users.`,
    inputPh: "Ask: where is login…",
    quick: { login: "Login", register: "Registration", profile: "Profile", offers: "Offers", users: "Users" },
    ttsOn: "Reading on",
    ttsOff: "Reading off",
    speakBtn: "🎤 Speak",
    listening: "Listening...",
    done: "Done!",
    error: "Microphone error",
    langLabel: "Language",
    foundOffer: (title: string, loc?: string) => `I found an offer: ${title}${loc ? ` in ${loc}` : ""}.`,
    offersGo: "Go to offers",
  },
} as const;

// --------- Fallback znalosti ---------

const FALLBACK_ROUTES: RouteInfo[] = [
  {
    path: "/",
    label: "Domov",
    short: ["domov", "home", "ponuky", "karty", "lifebridge", "hlavna strana", "úvodná", "offers"],
    description:
      "Prehľad ponúk používateľov (karty s titulkom, popisom, autorom, lokalitou a kategóriou).",
  },
  {
    path: "/login",
    label: "Prihlásenie",
    short: ["login", "prihlasenie", "prihlasenie", "prihlásenie", "prihlasit", "sign in", "signin"],
    description: "Formulár na prihlásenie – email + heslo.",
  },
  {
    path: "/register",
    label: "Registrácia",
    short: ["register", "registracia", "registrácia", "sign up", "signup", "vytvorit ucet", "create account"],
    description: "Formulár na vytvorenie účtu – meno, priezvisko, email, heslo, dátum narodenia.",
  },
  {
    path: "/profile",
    label: "Profil",
    short: ["profil", "moj profil", "môj profil", "account", "účet", "ucet", "profile", "my profile"],
    description: "Informácie o používateľovi + priestor na tvorbu vlastných ponúk (karty).",
  },
  {
    path: "/users",
    label: "Používatelia",
    short: ["používatelia", "uzivatelia", "users", "zoznam uzivatelov", "users list"],
    description: "Zoznam používateľov načítaný z backendu /api/users.",
  },
];

const FALLBACK_FAQ: QA[] = [
  {
    q: ["kde sa prihlásim", "ako sa prihlásiť", "kde je login", "login", "prihlasenie", "sign in", "where is login"],
    a_sk: "Na prihlásenie choď na stránku Prihlásenie. Klikni na tlačidlo nižšie alebo použi horné menu.",
    a_en: "Go to the Login page. Use the button below or the top navigation.",
  },
  {
    q: ["kde sa zaregistrujem", "ako si vytvorím účet", "registrácia", "sign up", "registration", "create account"],
    a_sk: "Účet si vytvoríš na stránke Registrácia. Vyplň všetky polia a odošli formulár.",
    a_en: "Create your account on the Registration page. Fill in all fields and submit the form.",
  },
  {
    q: ["kde nájdem ponuky", "karty", "domov", "home", "čo je na úvodnej", "offers", "list of offers"],
    a_sk: "Ponuky zobrazujeme na domovskej stránke. Nájdeš tam karty s titulkom, popisom a autorom.",
    a_en: "Offers are shown on the Home page as cards with title, description and author.",
  },
  {
    q: ["kde je môj profil", "profil", "account", "účet", "where is my profile", "profile"],
    a_sk: "Tvoj profil je na stránke Profil. Odtiaľ vieš tvoriť vlastné ponuky.",
    a_en: "Your profile is on the Profile page. From there you can create your own offers.",
  },
  {
    q: ["kde vidím všetkých používateľov", "users", "zoznam účtov", "list of users", "all users"],
    a_sk: "Zoznam používateľov je na stránke Používatelia (dáta z /api/users).",
    a_en: "The users list is on the Users page (data from /api/users).",
  },
];

// --------- Helpers ---------

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

const hasRecognition = (): boolean => {
  const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return !!SR;
};

const getRecognition = (lang: Lang): SpeechRecognition | null => {
  const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec: SpeechRecognition = new SR();
  rec.lang = lang === "en" ? "en-US" : "sk-SK";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  return rec;
};

const speak = (text: string, lang: Lang) => {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "en" ? "en-US" : "sk-SK";
  try { window.speechSynthesis.cancel(); } catch {}
  window.speechSynthesis.speak(u);
};

// --------- UI komponent: bublina ---------

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

  // Persistovaný jazyk
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("chatbot_lang");
      return (saved === "en" || saved === "sk") ? (saved as Lang) : "sk";
    } catch {
      return "sk";
    }
  });

  const [tts, setTts] = useState<boolean>(true); // predvolene ZAPNUTÉ
  const [listening, setListening] = useState(false);
  const [recSupported, setRecSupported] = useState<boolean>(false);
  const [recStatus, setRecStatus] = useState<RecStatus>("idle");
  const [greetSpoken, setGreetSpoken] = useState<boolean>(false); // čítaj až po otvorení (raz)

  const navigate = useNavigate();
  const location = useLocation();
  const listRef = useRef<HTMLDivElement>(null);

  // jazyk -> localStorage
  useEffect(() => {
    try { localStorage.setItem("chatbot_lang", lang); } catch {}
  }, [lang]);

  // zisti podporu rozpoznávania reči (jednorazovo)
  useEffect(() => {
    setRecSupported(hasRecognition());
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
          if (Array.isArray(sm) && sm.length) setRoutes(sm);
        }
        if (offersRes && offersRes.ok) {
          const of = await offersRes.json();
          if (Array.isArray(of)) setOffers(of);
        }
      } catch {}
    })();
  }, []);

  // pozdrav – vlož správu hneď po mount-e, ale NEČÍTAJ ju (hovor až po otvorení)
  const userName = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      const u = JSON.parse(raw);
      return u?.name || null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) return;
    const hello = STR[lang].hello(userName || undefined);
    setMessages([
      <Bubble from="bot" key="hello">
        <div className="space-y-2">
          <p>{hello}</p>
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
    // NEROB speak() tu – čítanie spustíme až po otvorení (nižšie v useEffect na open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keď používateľ otvorí widget prvýkrát -> prečítaj pozdrav
  useEffect(() => {
    if (open && !greetSpoken && tts) {
      const hello = STR[lang].hello(userName || undefined);
      try { speak(hello, lang); } catch {}
      setGreetSpoken(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

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
      const answer = lang === "en" ? qa.a_en : qa.a_sk;
      const suggested = route ?? routes[0];
      setMessages((prev) => [
        ...prev,
        <Bubble from="bot" key={`faq-${Date.now()}`}>
          <div className="space-y-2">
            <p>{answer}</p>
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
      say(answer);
      return;
    }

    if (offer) {
      const textOffer = STR[lang].foundOffer(offer.title, offer.location);
      setMessages((prev) => [
        ...prev,
        <Bubble from="bot" key={`offer-${Date.now()}`}>
          <div className="space-y-1">
            <p>{textOffer}</p>
            <button
              onClick={() => navigate("/")}
              className="mt-1 inline-flex items-center gap-1 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md"
            >
              {STR[lang].offersGo}
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

  // ---- Hlasový vstup (len veľké spodné tlačidlo) ----
  function toggleMic() {
    if (listening) {
      (window as any)._rec?.stop?.();
      setListening(false);
      setRecStatus("idle");
      return;
    }
    try { window.speechSynthesis?.cancel(); } catch {} // Zastav prebiehajúce čítanie pri štarte mikrofónu
    const rec = getRecognition(lang);
    if (!rec) return;
    (window as any)._rec = rec;
    try {
      setRecStatus("listening");
      setListening(true);
      // @ts-ignore
      rec.onresult = (e: any) => {
        const text = e.results?.[0]?.[0]?.transcript || "";
        setRecStatus("done");
        if (text) {
          setMessages((prev) => [...prev, <Bubble from="me" key={`me-voice-${Date.now()}`}>{text}</Bubble>]);
          setTimeout(() => reply(text), 80);
        }
        setTimeout(() => setRecStatus("idle"), 800);
      };
      // @ts-ignore
      rec.onerror = () => {
        setRecStatus("error");
        setTimeout(() => setRecStatus("idle"), 1000);
        setListening(false);
      };
      // @ts-ignore
      rec.onend = () => {
        setListening(false);
        if (recStatus === "listening") setRecStatus("idle");
      };
      rec.start();
    } catch {
      setListening(false);
      setRecStatus("error");
      setTimeout(() => setRecStatus("idle"), 1000);
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
        <div className="w-[400px] max-w-[92vw] h-[620px] flex flex-col rounded-2xl shadow-2xl bg-white/95 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
            <div className="flex items-center gap-2">
              <div className="font-semibold">{STR[lang].assistant}</div>
              {/* Dropdown výber jazyka */}
              <label className="ml-2 text-xs opacity-80" htmlFor="lang-select">{STR[lang].langLabel}</label>
              <select
                id="lang-select"
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="ml-1 text-xs bg-white/20 hover:bg-white/30 border border-white/30 rounded px-2 py-1 focus:outline-none"
                aria-label={STR[lang].langLabel}
              >
                <option value="sk">SK</option>
                <option value="en">EN</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              {/* TTS toggle */}
              <button
                onClick={() => {
                  setTts((v) => {
                    const next = !v;
                    if (!next) {
                      try { window.speechSynthesis?.cancel(); } catch {}
                    }
                    return next;
                  });
                }}
                className="p-1 rounded bg-white/15 hover:bg-white/25"
                title={tts ? STR[lang].ttsOff : STR[lang].ttsOn}
                aria-label="Toggle reading"
              >
                {tts ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <button onClick={() => setOpen(false)} aria-label="Zavrieť chat" className="p-1 rounded hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div ref={listRef} className="flex-1 p-3 space-y-3 overflow-y-auto bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
            {/* Info bar */}
            <div className="text-[11px] text-gray-500 dark:text-gray-400 px-1">
              {STR[lang].currentPage}: {location.pathname}
            </div>
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

          {/* Voice Controls (veľký dolný mikrofón + stav) */}
          <VoiceControls
            recSupported={recSupported}
            listening={listening}
            recStatus={recStatus}
            speakLabel={STR[lang].speakBtn}
            listeningLabel={STR[lang].listening}
            doneLabel={STR[lang].done}
            errorLabel={STR[lang].error}
            toggleMic={toggleMic}
          />

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

function VoiceControls(props: {
  recSupported: boolean;
  listening: boolean;
  recStatus: RecStatus;
  speakLabel: string;
  listeningLabel: string;
  doneLabel: string;
  errorLabel: string;
  toggleMic: () => void;
}) {
  const { recSupported, listening, recStatus, speakLabel, listeningLabel, doneLabel, errorLabel, toggleMic } = props;
  return (
    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80">
      <div className="flex flex-col gap-2">
        <button
          onClick={toggleMic}
          disabled={!recSupported}
          className={`w-full text-base md:text-lg font-semibold px-4 py-3 rounded-full
            ${recSupported ? (listening ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700") : "bg-gray-400 cursor-not-allowed"}
            text-white transition`}
          aria-pressed={listening}
          aria-label={speakLabel}
        >
          {speakLabel} {listening ? "⏺" : ""}
        </button>

        <div
          role="status"
          aria-live="polite"
          className={`text-sm md:text-base font-medium ${recStatus === "listening" ? "text-blue-700" : recStatus === "done" ? "text-green-700" : recStatus === "error" ? "text-red-700" : "text-gray-500"}`}
        >
          {recStatus === "listening" && listeningLabel}
          {recStatus === "done" && doneLabel}
          {recStatus === "error" && errorLabel}
          {recStatus === "idle" && " "}
        </div>
      </div>
    </div>
  );
}
