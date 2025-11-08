
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Send, MessageCircle, X, ChevronDown, Volume2, VolumeX } from "lucide-react";

/**
 * LifeBridge – Chatbot v4
 * - Fix: EN "Registration" now suggests and buttons say "Go to Registration" (not Home).
 *   * Added 'registration' to route shorts.
 *   * Added routeFromText() heuristic as fallback mapper.
 * - Responsiveness: adaptive width/height for phones/tablets/desktops,
 *   larger touch targets, overflow handling, and safe-area friendly layout.
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
  short: string[];
  description: string;
};

type QA = {
  q: string[];
  a_sk: string;
  a_en: string;
};

type Offer = {
  id?: number;
  title: string;
  description?: string;
  location?: string;
  category?: string;
};

type RecStatus = "idle" | "listening" | "done" | "error";

// --------- i18n ---------

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
    routes: { home: "Domov", login: "Prihlásenie", register: "Registrácia", profile: "Profil", users: "Používatelia" },
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
    routes: { home: "Home", login: "Login", register: "Registration", profile: "Profile", users: "Users" },
  },
} as const;

// Known route label localization by path
function getLocalizedRouteLabel(path: string, lang: Lang): string {
  const map: Record<string, { sk: string; en: string }> = {
    "/": { sk: STR.sk.routes.home, en: STR.en.routes.home },
    "/login": { sk: STR.sk.routes.login, en: STR.en.routes.login },
    "/register": { sk: STR.sk.routes.register, en: STR.en.routes.register },
    "/profile": { sk: STR.sk.routes.profile, en: STR.en.routes.profile },
    "/users": { sk: STR.sk.routes.users, en: STR.en.routes.users },
  };
  const rec = map[path];
  if (rec) return lang === "en" ? rec.en : rec.sk;
  return path;
}

// Fallback textual mapping when bestRouteFor() fails
function routeFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(login|sign\s?in)\b/.test(t)) return "/login";
  if (/\b(registration|register|sign\s?up)\b/.test(t)) return "/register";
  if (/\b(profile|account)\b/.test(t)) return "/profile";
  if (/\b(users?|user\slist)\b/.test(t)) return "/users";
  if (/\b(home|domov|start|main)\b/.test(t)) return "/";
  return null;
}

// --------- Fallback routes/FAQ ---------

const FALLBACK_ROUTES: RouteInfo[] = [
  { path: "/", label: STR.sk.routes.home, short: ["domov","home","ponuky","offers"], description:"Prehľad ponúk používateľov (karty s titulkom, popisom, autorom, lokalitou a kategóriou)." },
  { path: "/login", label: STR.sk.routes.login, short: ["login","prihlasenie","sign in","signin"], description:"Formulár na prihlásenie – email + heslo." },
  // add 'registration' to shorts so EN query matches
  { path: "/register", label: STR.sk.routes.register, short: ["register","registracia","sign up","signup","registration"], description:"Formulár na vytvorenie účtu – meno, priezvisko, email, heslo, dátum narodenia." },
  { path: "/profile", label: STR.sk.routes.profile, short: ["profil","account","profile"], description:"Informácie o používateľovi + priestor na tvorbu vlastných ponúk (karty)." },
  { path: "/users", label: STR.sk.routes.users, short: ["používatelia","users","users list"], description:"Zoznam používateľov načítaný z backendu /api/users." },
];

const FALLBACK_FAQ: QA[] = [
  { q: ["kde sa prihlásim","ako sa prihlásiť","kde je login","login","prihlasenie","sign in","where is login"],
    a_sk: "Na prihlásenie choď na stránku Prihlásenie. Klikni na tlačidlo nižšie alebo použi horné menu.",
    a_en: "Go to the Login page. Use the button below or the top navigation." },
  { q: ["kde sa zaregistrujem","ako si vytvorím účet","registrácia","sign up","registration","create account"],
    a_sk: "Účet si vytvoríš na stránke Registrácia. Vyplň všetky polia a odošli formulár.",
    a_en: "Create your account on the Registration page. Fill in all fields and submit the form." },
  { q: ["kde nájdem ponuky","karty","domov","home","čo je na úvodnej","offers","list of offers"],
    a_sk: "Ponuky zobrazujeme na domovskej stránke. Nájdeš tam karty s titulkom, popisom a autorom.",
    a_en: "Offers are shown on the Home page as cards with title, description and author." },
  { q: ["kde je môj profil","profil","account","účet","where is my profile","profile"],
    a_sk: "Tvoj profil je na stránke Profil. Odtiaľ vieš tvoriť vlastné ponuky.",
    a_en: "Your profile is on the Profile page. From there you can create your own offers." },
  { q: ["kde vidím všetkých používateľov","users","zoznam účtov","list of users","all users"],
    a_sk: "Zoznam používateľov je na stránke Používatelia (dáta z /api/users).",
    a_en: "The users list is on the Users page (data from /api/users)." },
];

// --------- Helpers ---------

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function score(h: string, needles: string[]) {
  const hay = norm(h);
  let sc = 0;
  for (const n of needles) {
    const nn = norm(n);
    if (nn && hay.includes(nn)) sc += nn.length;
  }
  return sc;
}

function bestRouteFor(text: string, routes: RouteInfo[]): RouteInfo | null {
  let best: { r: RouteInfo; s: number } | null = null;
  for (const r of routes) {
    const s = score(text, [r.label, ...r.short]);
    if (!best || s > best.s) best = { r, s };
  }
  return best && best.s > 0 ? best.r : null;
}

function bestFAQFor(text: string, faq: QA[]): QA | null {
  let best: { qa: QA; s: number } | null = null;
  for (const qa of faq) {
    const s = score(text, qa.q);
    if (!best || s > best.s) best = { qa, s };
  }
  return best && best.s > 0 ? best.qa : null;
}

function bestOfferFor(text: string, offers: Offer[]): Offer | null {
  const h = norm(text);
  let best: { o: Offer; s: number } | null = null;
  for (const o of offers) {
    const keys = [o.title, o.description || "", o.location || "", o.category || ""].filter(Boolean) as string[];
    const s = score(h, keys);
    if (!best || s > best.s) best = { o, s };
  }
  return best && best.s > 0 ? best.o : null;
}

// --------- Speech helpers ---------

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

// --------- UI: Bubble ---------

function Bubble({ from, children }: { from: "bot" | "me"; children: React.ReactNode }) {
  const isBot = from === "bot";
  return (
    <div className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-md ${
          isBot ? "bg-white/90 dark:bg-gray-800 text-gray-800 dark:text-gray-100" : "bg-blue-600 text-white"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// --------- Component ---------

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<React.ReactNode[]>([]);
  const [routes, setRoutes] = useState<RouteInfo[]>(FALLBACK_ROUTES);
  const [faq, setFaq] = useState<QA[]>(FALLBACK_FAQ);
  const [offers, setOffers] = useState<Offer[]>([]);

  const [lang, setLang] = useState<Lang>(() => {
    try { const saved = localStorage.getItem("chatbot_lang"); return (saved === "en" || saved === "sk") ? (saved as Lang) : "sk"; }
    catch { return "sk"; }
  });

  const [tts, setTts] = useState<boolean>(() => {
    try { const saved = localStorage.getItem("chatbot_tts"); return saved === "off" ? false : true; }
    catch { return true; }
  });

  const [listening, setListening] = useState(false);
  const [recSupported, setRecSupported] = useState<boolean>(false);
  const [recStatus, setRecStatus] = useState<RecStatus>("idle");
  const [greetSpoken, setGreetSpoken] = useState<boolean>(false);

  const navigate = useNavigate();
  const location = useLocation();
  const listRef = useRef<HTMLDivElement>(null);

  // persist TTS
  useEffect(() => {
    try { localStorage.setItem("chatbot_tts", tts ? "on" : "off"); } catch {}
    if (!tts) { try { window.speechSynthesis?.cancel(); } catch {} }
  }, [tts]);

  // cancel speech when route changes and tts is off
  useEffect(() => {
    if (!tts) { try { window.speechSynthesis?.cancel(); } catch {} }
  }, [location.pathname, tts]);

  // persist language
  useEffect(() => { try { localStorage.setItem("chatbot_lang", lang); } catch {} }, [lang]);

  // recognition support
  useEffect(() => { setRecSupported(hasRecognition()); }, []);

  // dynamic knowledge
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

  // hello bubble render (do not speak yet)
  const userName = useMemo(() => {
    try { const raw = localStorage.getItem("user"); if (!raw) return null; const u = JSON.parse(raw); return u?.name || null; } catch { return null; }
  }, []);

  useEffect(() => {
    if (messages.length > 0) return;
    rebuildHelloBubble();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Speak hello on first open (if TTS on)
  useEffect(() => {
    if (open && !greetSpoken && tts) {
      const hello = STR[lang].hello(userName || undefined);
      try { speak(hello, lang); } catch {}
      setGreetSpoken(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Rebuild hello bubble when language changes (keep rest of messages)
  useEffect(() => {
    if (messages.length === 0) return;
    rebuildHelloBubble(messages.slice(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, routes]);

  // Keep scroll at bottom when open
  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function localizedLabelForRoute(r: RouteInfo): string {
    const localized = getLocalizedRouteLabel(r.path, lang);
    return localized || r.label;
  }

  function rebuildHelloBubble(rest: React.ReactNode[] = []) {
    const hello = STR[lang].hello(userName || undefined);
    const helloBubble = (
      <Bubble from="bot" key="hello">
        <div className="space-y-2">
          <p>{hello}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {routes.map((r) => (
              <button
                key={r.path}
                onClick={() => handleNavigate(r)}
                className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {localizedLabelForRoute(r)}
              </button>
            ))}
          </div>
        </div>
      </Bubble>
    );
    setMessages([helloBubble, ...rest]);
  }

  function say(text: string) { if (tts) speak(text, lang); }

  function handleNavigate(r: RouteInfo) {
    const label = localizedLabelForRoute(r);
    const text = STR[lang].opening(label, r.description);
    setMessages((prev) => [
      ...prev,
      <Bubble from="bot" key={`nav-${r.path}-${Date.now()}`}>
        <div className="space-y-1">
          <p>{text}</p>
          <button
            onClick={() => navigate(r.path)}
            className="mt-1 inline-flex items-center gap-1 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md"
          >
            {STR[lang].goTo(label)}
          </button>
        </div>
      </Bubble>,
    ]);
    say(text);
  }

  function reply(text: string) {
    const qa = bestFAQFor(text, faq);
    let route = bestRouteFor(text, routes);
    if (!route) {
      const p = routeFromText(text);
      if (p) route = { path: p, label: "", short: [], description: "" };
    }
    const offer = offers.length ? bestOfferFor(text, offers) : null;

    if (qa) {
      const answer = lang === "en" ? qa.a_en : qa.a_sk;
      const suggested = route ?? routes[0];
      const sugLabel = suggested ? localizedLabelForRoute(suggested) : "";
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
                {STR[lang].goTo(sugLabel)}
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

    if (route) { handleNavigate(route); return; }

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
                className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {localizedLabelForRoute(r)}
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

  // Voice (only big bottom button)
  function toggleMic() {
    if (listening) {
      (window as any)._rec?.stop?.();
      setListening(false);
      setRecStatus("idle");
      return;
    }
    try { window.speechSynthesis?.cancel(); } catch {}
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

  // Responsive container sizing (safe-area aware)
  const panelClass = "flex flex-col rounded-2xl shadow-2xl bg-white/95 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden";
  const panelStyle: React.CSSProperties = {
    width: "min(100vw - 1rem, 430px)",
    height: "min(90svh, 680px)",
    // provide fallback for browsers without svh -> 90vh
    // @ts-ignore
    heightFallback: "min(90vh, 680px)",
    // padding for safe areas on iOS
    paddingBottom: "env(safe-area-inset-bottom)",
  };

  return (
    <div className="fixed z-50 bottom-4 right-4 left-auto">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          className="rounded-full shadow-lg p-4 bg-blue-600 text-white hover:bg-blue-700"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className={panelClass} style={panelStyle}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-sm sm:text-base">{STR[lang].assistant}</div>
              <label className="ml-2 text-xs opacity-90" htmlFor="lang-select">{STR[lang].langLabel}</label>
              <select
                id="lang-select"
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="ml-1 text-xs bg-white text-blue-900 font-semibold border border-white rounded px-2 py-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-white/70"
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
                    if (!next) { try { window.speechSynthesis?.cancel(); } catch {} }
                    return next;
                  });
                }}
                className={`p-2 sm:p-1 rounded ${tts ? "bg-white/15 hover:bg-white/25" : "bg-white/20 hover:bg-white/30"} `}
                title={tts ? STR[lang].ttsOff : STR[lang].ttsOn}
                aria-label="Toggle reading"
              >
                {tts ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <button onClick={() => setOpen(false)} aria-label="Close chat" className="p-2 sm:p-1 rounded hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div ref={listRef} className="flex-1 p-3 space-y-3 overflow-y-auto bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
            <div className="text-[11px] text-gray-500 dark:text-gray-400 px-1">
              {STR[lang].currentPage}: {location.pathname}
            </div>
            {messages}
          </div>

          {/* Quick actions */}
          <div className="px-3 pb-2 pt-1 border-t border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/60">
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
              <QuickAction label={STR[lang].quick.login} onClick={() => reply(lang === "en" ? "login" : "prihlásenie")} />
              <QuickAction label={STR[lang].quick.register} onClick={() => reply(lang === "en" ? "registration" : "registrácia")} />
              <QuickAction label={STR[lang].quick.profile} onClick={() => reply(lang === "en" ? "profile" : "profil")} />
              <QuickAction label={STR[lang].quick.offers} onClick={() => reply(lang === "en" ? "offers" : "ponuky")} />
              <QuickAction label={STR[lang].quick.users} onClick={() => reply(lang === "en" ? "users" : "používatelia")} />
            </div>
          </div>

          {/* Voice Controls */}
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
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3 sm:py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
              <button type="submit" className="inline-flex items-center gap-2 px-4 py-3 sm:px-3 sm:py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99]">
                <Send className="w-5 h-5" />
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
      className="text-xs px-3 py-2 sm:py-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
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

        <div role="status" aria-live="polite"
          className={`text-sm md:text-base font-medium ${recStatus === "listening" ? "text-blue-700" : recStatus === "done" ? "text-green-700" : recStatus === "error" ? "text-red-700" : "text-gray-500"}`}>
          {recStatus === "listening" && listeningLabel}
          {recStatus === "done" && doneLabel}
          {recStatus === "error" && errorLabel}
          {recStatus === "idle" && " "}
        </div>
      </div>
    </div>
  );
}
