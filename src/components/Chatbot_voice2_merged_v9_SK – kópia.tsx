import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Send, MessageCircle, X, ChevronDown, Volume2, VolumeX } from "lucide-react";

/**
 * LifeBridge – Chatbot v9 (SK-only)
 * - Docked bottom-right, tablet+mobile responsive.
 * - Slovak UI only (removed English and language switcher).
 * - Female Slovak TTS preference with optional override via localStorage: chatbot_voice_sk.
 */

// --------- Web Speech API typy (minimal) ---------
declare var webkitSpeechRecognition: {
  new (): any;
};

type Lang = "sk"; // SK-only

type RouteInfo = {
  path: string;
  label: string;
  short: string[];
  description: string;
};

type QA = {
  q: string[];
  a_sk: string;
};

type Offer = {
  id?: number;
  title: string;
  description?: string;
  location?: string;
  category?: string;
};

type RecStatus = "idle" | "listening" | "done" | "error";

// --------- Slovak strings ---------

const STR = {
  assistant: "LifeBridge Asistent",
  currentPage: "Aktuálna stránka",
  hello: (name?: string) =>
    `${name ? `Ahoj ${name}!` : "Ahoj!"} Som asistent LifeBridge. Spýtaj sa, kde nájdeš prihlásenie, registráciu, profil, ponuky alebo zoznam používateľov.`,
  goTo: (label: string) => `Prejsť na ${label}`,
  opening: (label: string, desc: string) => `Jasné! Otváram ${label} – ${desc}`,
  fallback:
    `Zatiaľ si s týmto dotazom neviem rady – skús, prosím, spomenúť, či chceš prihlásenie, registráciu, profil, ponuky alebo používateľov.`,
  inputPh: "Spýtaj sa: kde je prihlásenie?|",
  quick: { login: "Prihlásenie", register: "Registrácia", profile: "Profil", offers: "Ponuky", users: "Používatelia" },
  ttsOn: "Čítanie zapnuté",
  ttsOff: "Čítanie vypnuté",
  speakBtn: "🎤 Hovoriť",
  listening: "Počúvam...",
  done: "Hotovo!",
  error: "Chyba mikrofónu",
  foundOffer: (title: string, loc?: string) => `Našiel som ponuku: ${title}${loc ? ` v ${loc}` : ""}.`,
  offersGo: "Prejsť na ponuky",
  routes: { home: "Domov", login: "Prihlásenie", register: "Registrácia", profile: "Profil", users: "Používatelia", posts: "Príspevky" },
} as const;

// --------- Helpers for routes & matching ---------

function getLocalizedRouteLabel(path: string): string {
  const map: Record<string, string> = {
    "/": STR.routes.home,
    "/login": STR.routes.login,
    "/register": STR.routes.register,
    "/profile": STR.routes.profile,
    "/users": STR.routes.users,
  };
  return map[path] ?? path;
}

function routeFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(prihlas|login|sign\s?in)\b/.test(t)) return "/login";
  if (/\b(registr|sign\s?up)\b/.test(t)) return "/register";
  if (/\b(profil|account)\b/.test(t)) return "/profile";
  if (/\b(pou[zž]ívatel|users?)\b/.test(t)) return "/users";
  if (/\b(domov|home|hlavn[áa])\b/.test(t)) return "/";
  return null;
}

const FALLBACK_ROUTES: RouteInfo[] = [
  { path: "/", label: STR.routes.home, short: ["domov","home","ponuky","offers"], description: "Prehľad ponúk používateľov (karty s titulkom, popisom, autorom, lokalitou)." },
  { path: "/login", label: STR.routes.login, short: ["prihlásenie","login","sign in"], description: "Prihlásenie do účtu (meno/heslo)." },
  { path: "/register", label: STR.routes.register, short: ["registrácia","sign up","registration"], description: "Vytvorenie nového účtu." },
  { path: "/profile", label: STR.routes.profile, short: ["profil","account","účet"], description: "Tvoj profil a správa vlastných ponúk." },
  { path: "/users", label: STR.routes.users, short: ["používatelia","users","zoznam"], description: "Zoznam používateľov." },
];

const FALLBACK_FAQ: QA[] = [
  { q: ["kde sa prihlásim","prihlásenie","login","sign in"], a_sk: "Na prihlásenie choď na stránku Prihlásenie. Klikni na tlačidlo nižšie alebo použi horné menu." },
  { q: ["kde sa zaregistrujem","ako si vytvorím účet","registrácia","sign up","registration","create account"], a_sk: "Účet si vytvoríš na stránke Registrácia. Vyplň všetky polia a odošli formulár." },
  { q: ["kde nájdem ponuky","karty","domov","home","čo je na úvodnej","offers","list of offers"], a_sk: "Ponuky zobrazujeme na domovskej stránke. Nájdeš tam karty s titulkom, popisom a autorom." },
  { q: ["kde je môj profil","profil","account","účet","where is my profile","profile"], a_sk: "Tvoj profil je na stránke Profil. Odtiaľ vieš tvoriť vlastné ponuky." },
  { q: ["kde vidím všetkých používateľov","users","zoznam účtov","list of users","all users"], a_sk: "Zoznam používateľov je na stránke Používatelia (dáta z /api/users)." },
];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

// --------- Speech helpers (SK) ---------

const hasRecognition = (): boolean => {
  const w: any = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
};
const getRecognition = (): any | null => {
  const w: any = window as any;
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) return null;
  const rec: any = new SR();
  rec.lang = "sk-SK";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  return rec;
};

// --- Better TTS for SK (female, calmer) ---
let cachedVoices: SpeechSynthesisVoice[] = [];
function refreshVoices() {
  try { cachedVoices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }
  catch { cachedVoices = []; }
}
function pickVoiceSK(): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  if (!cachedVoices.length) refreshVoices();

  // Manual override (exact voice name)
  try {
    const override = localStorage.getItem("chatbot_voice_sk");
    if (override) {
      const v = cachedVoices.find(v => v.name === override);
      if (v) return v;
    }
  } catch {}

  const candidates = cachedVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith("sk"));
  const preferSK = ["Google slovensk", "Google Slovak", "Microsoft Viktoria", "Viktoria", "Zuzana", "Iveta", "Jana", "Lucia"];

  for (const name of preferSK) {
    const v = candidates.find(vo => vo.name.toLowerCase().includes(name.toLowerCase()));
    if (v) return v;
  }

  // Heuristic female scoring
  const skFemaleNames = ["Viktoria","Viktória","Zuzana","Iveta","Jana","Lucia","Laura","Katarina","Karolina","Mária","Eva"];
  const femaleHints = ["female","žena","zena","woman","f"];
  let best: { v: SpeechSynthesisVoice; s: number } | null = null;
  for (const v of candidates) {
    let s = 0;
    const nm = v.name.toLowerCase();
    if (femaleHints.some(f => nm.includes(f))) s += 3;
    if (skFemaleNames.some(n => nm.includes(n.toLowerCase()))) s += 2;
    if (/google|natural|neural/.test(nm)) s += 1;
    if (/(peter|jozef|boris|adam|juraj|matej|lukas|martin)/i.test(v.name)) s -= 3;
    if (!best || s > best.s) best = { v, s };
  }
  if (best && best.s > 0) return best.v;

  return candidates[0] || null;
}

const speak = (text: string) => {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "sk-SK";
  const voice = pickVoiceSK();
  if (voice) u.voice = voice;
  // calmer tone
  u.rate = 0.92;
  u.pitch = 1.02;
  try { window.speechSynthesis.cancel(); } catch {}
  window.speechSynthesis.speak(u);
};

if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => refreshVoices();
}

// --------- UI small pieces ---------

function Bubble({ from, children }: { from: "bot" | "me"; children: React.ReactNode }) {
  const isBot = from === "bot";
  return (
    <div className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-md ${
          isBot ? "bg-white/90 dark:bg-gray-800 text-gray-800 dark:text-gray-100" : "bg-blue-600 text-white"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// --------- Component ---------

export default function ChatbotWidgetSKv9() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<React.ReactNode[]>([]);
  const [routes, setRoutes] = useState<RouteInfo[]>(FALLBACK_ROUTES);
  const [faq, setFaq] = useState<QA[]>(FALLBACK_FAQ);
  const [offers, setOffers] = useState<Offer[]>([]);

  const lang: Lang = "sk";

  const [tts, setTts] = useState<boolean>(() => {
    try { const saved = localStorage.getItem("chatbot_tts"); return saved === "off" ? false : true; }
    catch { return true; }
  });

  const [listening, setListening] = useState(false);
  const [recSupported, setRecSupported] = useState<boolean>(false);
  const [recStatus, setRecStatus] = useState<RecStatus>("idle");
  const [greetSpoken, setGreetSpoken] = useState<boolean>(false);
  const [dims, setDims] = useState<{w:number; h:number}>({ w: 390, h: 620 });

  const navigate = useNavigate();
  const location = useLocation();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setRecSupported(hasRecognition()); }, []);

  // Persist toggles
  useEffect(() => {
    try { localStorage.setItem("chatbot_tts", tts ? "on" : "off"); } catch {}
    if (!tts) { try { window.speechSynthesis?.cancel(); } catch {} }
  }, [tts]);
  useEffect(() => { if (!tts) { try { window.speechSynthesis?.cancel(); } catch {} } }, [location.pathname, tts]);

  // Dynamic data
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

  // Greeting
  const userName = useMemo(() => {
    try { const raw = localStorage.getItem("user"); if (!raw) return null; const u = JSON.parse(raw); return u?.name || null; } catch { return null; }
  }, []);

  useEffect(() => { if (messages.length === 0) rebuildHelloBubble(); }, []);
  useEffect(() => {
    if (open && !greetSpoken && tts) {
      const hello = STR.hello(userName || undefined);
      try { speak(hello); } catch {}
      setGreetSpoken(true);
    }
  }, [open]);
  useEffect(() => { if (messages.length) rebuildHelloBubble(messages.slice(1)); }, [routes]);
  useEffect(() => { if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, open]);

  // --- RESPONSIVE (tablet & down; docked) ---
  useEffect(() => {
    const compute = () => {
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

      let w: number;
      if (vw < 380) w = Math.floor(vw * 0.96);
      else if (vw < 480) w = Math.floor(vw * 0.92);
      else if (vw < 600) w = Math.floor(vw * 0.86);
      else if (vw < 900) w = Math.floor(vw * 0.55);
      else if (vw < 1200) w = Math.floor(vw * 0.42);
      else w = 430;

      w = Math.min(w, 480);
      w = Math.max(w, 320);

      let h: number;
      if (vh < 640) h = Math.floor(vh * 0.68);
      else if (vh < 820) h = Math.floor(vh * 0.74);
      else h = Math.floor(vh * 0.78);
      h = Math.min(h, 700);
      h = Math.max(h, 520);

      setDims({ w, h });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  function localizedLabelForRoute(r: RouteInfo): string {
    const localized = getLocalizedRouteLabel(r.path);
    return localized || r.label;
  }

  function forceNavigate(path: string) {
    if (location.pathname === path) {
      navigate(0); // remount even if on same route
    } else {
      navigate(path);
    }
  }

  function rebuildHelloBubble(rest: React.ReactNode[] = []) {
    const hello = STR.hello(userName || undefined);
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

  function say(text: string) { if (tts) speak(text); }

  function handleNavigate(r: RouteInfo) {
    const label = localizedLabelForRoute(r);
    const text = STR.opening(label, r.description);
    setMessages((prev) => [
      ...prev,
      <Bubble from="bot" key={`nav-${r.path}-${Date.now()}`}>
        <div className="space-y-1">
          <p>{text}</p>
          <button
            onClick={() => forceNavigate(r.path)}
            className="mt-1 inline-flex items-center gap-1 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md"
          >
            {STR.goTo(label)}
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
      const answer = qa.a_sk;
      const suggested = route ?? routes[0];
      const sugLabel = suggested ? localizedLabelForRoute(suggested) : "";
      setMessages((prev) => [
        ...prev,
        <Bubble from="bot" key={`faq-${Date.now()}`}>
          <div className="space-y-2">
            <p>{answer}</p>
            {suggested && (
              <button
                onClick={() => forceNavigate(suggested.path)}
                className="inline-flex items-center gap-1 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md"
              >
                {STR.goTo(sugLabel)}
              </button>
            )}
          </div>
        </Bubble>,
      ]);
      say(answer);
      return;
    }

    if (offer) {
      const textOffer = STR.foundOffer(offer.title, offer.location);
      setMessages((prev) => [
        ...prev,
        <Bubble from="bot" key={`offer-${Date.now()}`}>
          <div className="space-y-1">
            <p>{textOffer}</p>
            <button
              onClick={() => forceNavigate("/")}
              className="mt-1 inline-flex items-center gap-1 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md"
            >
              {STR.offersGo}
            </button>
          </div>
        </Bubble>,
      ]);
      say(textOffer);
      return;
    }

    if (route) { handleNavigate(route); return; }

    const fb = STR.fallback;
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

  function toggleMic() {
    if (listening) {
      (window as any)._rec?.stop?.();
      setListening(false);
      setRecStatus("idle");
      return;
    }
    try { window.speechSynthesis?.cancel(); } catch {}
    const rec = getRecognition();
    if (!rec) return;
    (window as any)._rec = rec;
    try {
      setRecStatus("listening");
      setListening(true);
      rec.onresult = (e: any) => {
        const text = e?.results?.[0]?.[0]?.transcript || "";
        setRecStatus("done");
        if (text) {
          setMessages((prev) => [...prev, <Bubble from="me" key={`me-voice-${Date.now()}`}>{text}</Bubble>]);
          setTimeout(() => reply(text), 80);
        }
        setTimeout(() => setRecStatus("idle"), 800);
      };
      rec.onerror = () => {
        setRecStatus("error");
        setTimeout(() => setRecStatus("idle"), 1000);
        setListening(false);
      };
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

  // Docked (bottom-right) panel – responsive size for tablets & phones
  const panelClass = "flex flex-col rounded-2xl shadow-2xl bg-white/95 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden";
  const panelStyle: React.CSSProperties = {
    width: dims.w,
    height: dims.h,
    paddingBottom: "env(safe-area-inset-bottom)",
  };

  return (
    <div
      className="fixed z-50"
      style={{
        right: "max(env(safe-area-inset-right), 12px)",
        bottom: "max(env(safe-area-inset-bottom), 12px)",
      }}
    >
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Otvoriť chat"
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
              <div className="font-semibold text-sm sm:text-base">{STR.assistant}</div>
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
                title={tts ? STR.ttsOff : STR.ttsOn}
                aria-label="Prepnúť čítanie"
              >
                {tts ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <button onClick={() => setOpen(false)} aria-label="Zavrieť chat" className="p-2 sm:p-1 rounded hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div ref={listRef} className="flex-1 p-3 space-y-3 overflow-y-auto bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
            <div className="text-[11px] text-gray-500 dark:text-gray-400 px-1">
              {STR.currentPage}: {location.pathname}
            </div>
            {messages}
          </div>

          {/* Quick actions */}
          <div className="px-3 pb-2 pt-1 border-t border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/60">
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
              <QuickAction label={STR.quick.login} onClick={() => reply("prihlásenie")} />
              <QuickAction label={STR.quick.register} onClick={() => reply("registrácia")} />
              <QuickAction label={STR.quick.profile} onClick={() => reply("profil")} />
              <QuickAction label={STR.quick.offers} onClick={() => reply("ponuky")} />
              <QuickAction label={STR.quick.users} onClick={() => reply("používatelia")} />
            </div>
          </div>

          {/* Voice Controls */}
          <VoiceControls
            recSupported={recSupported}
            listening={listening}
            recStatus={recStatus}
            speakLabel={STR.speakBtn}
            listeningLabel={STR.listening}
            doneLabel={STR.done}
            errorLabel={STR.error}
            toggleMic={toggleMic}
          />

          {/* Input */}
          <form onSubmit={onSubmit} className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={STR.inputPh}
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
          {speakLabel} {listening ? "…" : ""}
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
