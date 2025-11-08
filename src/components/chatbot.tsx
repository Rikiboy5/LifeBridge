import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Send, MessageCircle, X, ChevronDown } from "lucide-react";

/**
 * LifeBridge – On‑site Chatbot (client‑only)
 * ------------------------------------------------------
 * Účel: Pomáha používateľom zorientovať sa na webe (kde je prihlásenie,
 * registrácia, profil, ponuky, používatelia, atď.)
 *
 * Implementácia: čisto frontend (React/TS), bez API kľúčov.
 * - Vie odpovedať na FAQ a navigovať (useNavigate) na konkrétne stránky.
 * - Rozumie synonymám a preklepom (fuzzy match ~ jednoduché skórovanie).
 * - Pozná aktuálnu trasu (useLocation) a vie navrhnúť ďalšie kroky.
 * - Vychádza z vašej reálnej štruktúry routovanej aplikácie.
 *
 * Integrácia: vložte <ChatbotWidget /> do MainLayout (alebo do App.tsx),
 * aby bol dostupný na všetkých stránkach.
 */

// --------- Typy ---------

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

// --------- Konfigurácia znalostí o vašom webe ---------

const ROUTES: RouteInfo[] = [
  {
    path: "/",
    label: "Domov",
    short: ["domov", "home", "ponuky", "karty", "lifeBridge", "hlavná strana"],
    description:
      "Prehľad ponúk používateľov (karty s titulkom, popisom, autorom, lokalitou a kategóriou).",
  },
  {
    path: "/login",
    label: "Prihlásenie",
    short: ["login", "prihlásenie", "prihlasit", "prihlasit sa", "sign in", "signin"],
    description: "Formulár na prihlásenie – email + heslo.",
  },
  {
    path: "/register",
    label: "Registrácia",
    short: [
      "register",
      "registrácia",
      "registracia",
      "sign up",
      "signup",
      "vytvorit ucet",
      "nový účet",
      "novy ucet",
    ],
    description: "Formulár na vytvorenie účtu – meno, priezvisko, email, heslo, dátum narodenia.",
  },
  {
    path: "/profile",
    label: "Profil",
    short: ["profil", "môj profil", "moj profil", "account", "účet", "ucet"],
    description:
      "Informácie o používateľovi + priestor na tvorbu vlastných ponúk (karty).",
  },
  {
    path: "/users",
    label: "Používatelia",
    short: ["používatelia", "uzivatelia", "users", "zoznam uzivatelov"],
    description: "Zoznam používateľov načítaný z backendu /api/users.",
  },
];

const FAQ: QA[] = [
  {
    q: [
      "kde sa prihlásim",
      "ako sa prihlásiť",
      "kde je login",
      "login",
      "prihlasenie",
    ],
    a: "Na prihlásenie choď na stránku Prihlásenie. Klikni na tlačidlo nižšie alebo použi horné menu.",
  },
  {
    q: [
      "kde sa zaregistrujem",
      "ako si vytvorím účet",
      "registrácia",
      "sign up",
    ],
    a: "Účet si vytvoríš na stránke Registrácia. Vyplň všetky polia a odošli formulár.",
  },
  {
    q: [
      "kde nájdem ponuky",
      "karty",
      "domov",
      "home",
      "čo je na úvodnej",
    ],
    a: "Ponuky zobrazujeme na domovskej stránke. Nájdeš tam karty s titulkom, popisom a autorom.",
  },
  {
    q: ["kde je môj profil", "profil", "account", "účet"],
    a: "Tvoj profil je na stránke Profil. Odtiaľ vieš neskôr tvoriť vlastné ponuky.",
  },
  {
    q: ["kde vidím všetkých používateľov", "users", "zoznam účtov"],
    a: "Zoznam používateľov nájdeš na stránke Používatelia (načítava sa z /api/users).",
  },
];

// --------- Pomocné funkcie ---------

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
    if (h.includes(nn)) sc += nn.length; // jednoduché skórovanie – dlhšie zhody majú väčšiu váhu
  }
  return sc;
}

function bestRouteFor(text: string): RouteInfo | null {
  let best: { r: RouteInfo; s: number } | null = null;
  for (const r of ROUTES) {
    const s = score(text, [r.label, ...r.short]);
    if (!best || s > best.s) best = { r, s };
  }
  if (!best || best.s === 0) return null;
  return best.r;
}

function bestFAQFor(text: string): QA | null {
  let best: { qa: QA; s: number } | null = null;
  for (const qa of FAQ) {
    const s = score(text, qa.q);
    if (!best || s > best.s) best = { qa, s };
  }
  if (!best || best.s === 0) return null;
  return best.qa;
}

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
  const navigate = useNavigate();
  const location = useLocation();
  const listRef = useRef<HTMLDivElement>(null);

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
    // posuň na koniec pri každej zmene
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // uvítacia správa
  useEffect(() => {
    if (messages.length > 0) return;
    setMessages([
      <Bubble from="bot" key="hello">
        <div className="space-y-2">
          <p>
            {userName ? `Ahoj ${userName}! ` : "Ahoj! "}
            Som asistent LifeBridge. Viem ti poradiť, kde na webe nájdeš prihlásenie,
            registráciu, profil, ponuky alebo zoznam používateľov.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {ROUTES.map((r) => (
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

  function handleNavigate(r: RouteInfo) {
    setMessages((prev) => [
      ...prev,
      <Bubble from="bot" key={`nav-${r.path}`}>
        <div className="space-y-1">
          <p>
            Jasné! Otváram <b>{r.label}</b> – {r.description}
          </p>
          <button
            onClick={() => navigate(r.path)}
            className="mt-1 inline-flex items-center gap-1 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md"
          >
            Prejsť na {r.label}
          </button>
        </div>
      </Bubble>,
    ]);
  }

  function reply(text: string) {
    const route = bestRouteFor(text);
    const faq = bestFAQFor(text);

    // preferuj FAQ odpoveď a ponúkni navigáciu
    if (faq) {
      const suggested = route ?? ROUTES[0];
      setMessages((prev) => [
        ...prev,
        <Bubble from="bot" key={`faq-${Date.now()}`}>
          <div className="space-y-2">
            <p>{faq.a}</p>
            {suggested && (
              <button
                onClick={() => navigate(suggested.path)}
                className="inline-flex items-center gap-1 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md"
              >
                Prejsť na {suggested.label}
              </button>
            )}
          </div>
        </Bubble>,
      ]);
      return;
    }

    if (route) {
      handleNavigate(route);
      return;
    }

    // fallback – popíš kam sa dá ísť
    setMessages((prev) => [
      ...prev,
      <Bubble from="bot" key={`fallback-${Date.now()}`}>
        <div className="space-y-2">
          <p>
            Zatiaľ si s týmto dotazom neviem rady 🤔 Skús prosím spomenúť, či chceš
            <b> prihlásenie</b>, <b>registráciu</b>, <b>profil</b>, <b>ponuky</b> alebo
            <b> používateľov</b>.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {ROUTES.map((r) => (
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
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, <Bubble from="me" key={`me-${Date.now()}`}>{text}</Bubble>]);
    setInput("");
    setTimeout(() => reply(text), 100);
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
        <div className="w-[360px] max-w-[92vw] h-[520px] flex flex-col rounded-2xl shadow-2xl bg-white/95 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
            <div>
              <div className="font-semibold">LifeBridge Asistent</div>
              <div className="text-xs opacity-80">Aktuálna stránka: {location.pathname}</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Zavrieť chat" className="p-1 rounded hover:bg-white/20">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div ref={listRef} className="flex-1 p-3 space-y-3 overflow-y-auto bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
            {messages}
          </div>

          {/* Quick actions */}
          <div className="px-3 pb-2 pt-1 border-t border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/60">
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
              <QuickAction label="Prihlásenie" onClick={() => reply("kde je prihlásenie")} />
              <QuickAction label="Registrácia" onClick={() => reply("registrácia")} />
              <QuickAction label="Profil" onClick={() => reply("kde je môj profil")} />
              <QuickAction label="Ponuky" onClick={() => reply("kde nájdem ponuky")} />
              <QuickAction label="Používatelia" onClick={() => reply("používatelia")} />
            </div>
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Spýtaj sa: kde je prihlásenie…"
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
              >
                <Send className="w-4 h-4" /> Poslať
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
