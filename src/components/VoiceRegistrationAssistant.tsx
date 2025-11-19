import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Mic, RefreshCcw, Square } from "lucide-react";

type SpeechRecognitionTranscript = {

  transcript: string;

};



type SpeechRecognitionResult = {

  [alternative: number]: SpeechRecognitionTranscript;

};



type SpeechRecognitionEvent = {

  results?: {

    [resultIndex: number]: SpeechRecognitionResult;

  };

};



type SpeechRecognition = {

  lang: string;

  interimResults: boolean;

  maxAlternatives: number;

  onresult: ((event: SpeechRecognitionEvent) => void) | null;

  onerror: ((event: any) => void) | null;

  onend: (() => void) | null;

  start: () => void;

  stop: () => void;

  abort?: () => void;

};



type SpeechRecognitionConstructor = new () => SpeechRecognition;



declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type RecStatus = "idle" | "listening" | "error";

type StepKey = "firstName" | "lastName" | "email" | "password" | "passwordConfirm" | "birthdate";

type RegistrationData = Record<StepKey, string>;

type StepConfig = {
  key: StepKey;
  label: string;
  prompt: string;
  retryPrompt: string;
  maxLength: number;
  sanitize?: (value: string) => string;
  validate?: (value: string) => string | null;
  validateWithState?: (value: string, data: RegistrationData) => string | null;
};

const DEFAULT_DATA: RegistrationData = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  passwordConfirm: "",
  birthdate: "",
};

const sanitizeName = (value: string) => value.replace(/[^A-Za-zÀ-ž'\s-]/g, "").replace(/\s+/g, " ").trim();
const sanitizeEmail = (value: string) => value.replace(/\s+/g, "").trim().toLowerCase();
const pad2 = (num: number) => num.toString().padStart(2, "0");

const tryBuildIsoDate = (day: string, month: string, year: string): string | null => {
  const d = Number(day);
  const m = Number(month);
  let y = year.length === 2 ? Number((Number(year) > 30 ? "19" : "20") + year) : Number(year);
  if (!d || !m || !y) return null;
  if (y < 1900 || y > new Date().getFullYear()) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() + 1 !== m || parsed.getUTCDate() !== d) return null;
  return iso;
};

const normalizeWord = (word: string) =>
  word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const cleanWord = (word: string) => normalizeWord(word).replace(/[^a-z0-9]/g, "");

const MONTH_WORDS: Record<string, string> = {
  januar: "01",
  januara: "01",
  januari: "01",
  februar: "02",
  februara: "02",
  marec: "03",
  marca: "03",
  april: "04",
  aprila: "04",
  maj: "05",
  maja: "05",
  jun: "06",
  juna: "06",
  jul: "07",
  jula: "07",
  august: "08",
  augusta: "08",
  september: "09",
  septembra: "09",
  oktober: "10",
  oktobra: "10",
  november: "11",
  novembra: "11",
  december: "12",
  decembra: "12",
};

const DAY_DIRECT: Record<string, number> = {
  prv: 1,
  prve: 1,
  prvy: 1,
  jeden: 1,
  jedn: 1,
  druhe: 2,
  druhy: 2,
  druh: 2,
  dva: 2,
  tretie: 3,
  tret: 3,
  stvrt: 4,
  stvrte: 4,
  stvrty: 4,
  styri: 4,
  pat: 5,
  piat: 5,
  sieste: 6,
  sest: 6,
  siedme: 7,
  sedem: 7,
  osme: 8,
  osm: 8,
  deviate: 9,
  devat: 9,
  desiate: 10,
  desiaty: 10,
  jedenaste: 11,
  jedenast: 11,
  dvanaste: 12,
  dvanast: 12,
  trinaste: 13,
  trinast: 13,
  styrnaste: 14,
  patnaste: 15,
  patnast: 15,
  sestnaste: 16,
  sedemnaste: 17,
  osemnaste: 18,
  devatnaste: 19,
  dvadsiate: 20,
  dvadsiaty: 20,
  tridsiate: 30,
};

const DAY_TENS: Record<string, number> = {
  dvadsiat: 20,
  tridsiat: 30,
};

const stripOrdinalSuffix = (token: string) =>
  token.replace(/(teho|te|eho|ho|e|a|u|y|o)$/g, "");

const parseSpokenDay = (tokens: string[], index: number) => {
  const normalize = (word: string) => stripOrdinalSuffix(cleanWord(word));
  const current = normalize(tokens[index]);
  if (DAY_DIRECT[current]) {
    return { value: DAY_DIRECT[current], consumed: 1 };
  }
  if (DAY_TENS[current]) {
    let total = DAY_TENS[current];
    let consumed = 1;
    const next = tokens[index + 1];
    if (next) {
      const nextNorm = normalize(next);
      if (DAY_DIRECT[nextNorm] && DAY_DIRECT[nextNorm] < 10) {
        total += DAY_DIRECT[nextNorm];
        consumed += 1;
      }
    }
    return { value: total, consumed };
  }
  return null;
};

const parseSpokenDate = (value: string): string | null => {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  let day: string | null = null;
  let month: string | null = null;
  let year: string | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const numeric = raw.replace(/[^\d]/g, "");
    if (!year && numeric.length === 4) {
      year = numeric;
      continue;
    }

    if (!day && numeric && numeric.length > 0 && numeric.length <= 2) {
      const numericDay = Number(numeric);
      if (numericDay > 0 && numericDay <= 31) {
        day = pad2(numericDay);
        continue;
      }
    }

    if (!month) {
      const norm = cleanWord(raw);
      if (MONTH_WORDS[norm]) {
        month = MONTH_WORDS[norm];
        continue;
      }
    }

    if (!day) {
      const parsed = parseSpokenDay(tokens, i);
      if (parsed) {
        day = pad2(parsed.value);
        i += parsed.consumed - 1;
        continue;
      }
    }
  }

  if (day && month && year) {
    return tryBuildIsoDate(day, month, year) ?? `${year}-${month}-${day}`;
  }
  return null;
};

const sanitizeBirthdate = (value: string) => {
  const cleaned = value.replace(/[^0-9.\-\/\sA-Za-zÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽáäčďéíĺľňóôŕšťúýž]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const spoken = parseSpokenDate(cleaned);
  if (spoken) return spoken;
  const tokens = cleaned.split(/[.\-\/\s]+/).filter(Boolean);
  if (tokens.length >= 3) {
    const iso = tryBuildIsoDate(tokens[0], tokens[1], tokens[2]);
    if (iso) return iso;
  }
  const digits = cleaned.replace(/[^\d]/g, "");
  if (digits.length === 8) {
    const iso = tryBuildIsoDate(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4));
    if (iso) return iso;
  }
  if (digits.length === 6) {
    const iso = tryBuildIsoDate(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4));
    if (iso) return iso;
  }
  return cleaned;
};const updateControlledInput = (name: string, value: string) => {
  if (typeof document === "undefined") return;
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) return;
  const prototype = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  prototype?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const NUMBER_WORDS: Record<string, string> = {
  nula: "0",
  jeden: "1",
  jedna: "1",
  dva: "2",
  dve: "2",
  tri: "3",
  styri: "4",
  štyri: "4",
  pat: "5",
  päť: "5",
  sest: "6",
  šesť: "6",
  sedem: "7",
  osem: "8",
  devat: "9",
  deväť: "9",
};

const SPECIAL_WORDS: Record<string, string> = {
  bodka: ".",
  botka: ".",
  bodku: ".",
  ciarka: ",",
  čiarka: ",",
  pomlcka: "-",
  pomlčka: "-",
  minus: "-",
  plus: "+",
  krat: "*",
  krát: "*",
  hviezdicka: "*",
  hviezdička: "*",
  hviezda: "*",
  mriežka: "#",
  mrieska: "#",
  hash: "#",
  zavinac: "@",
  zavíňáč: "@",
  at: "@",
  lomeno: "/",
  lomitko: "/",
  spatnelomeno: "\\",
  spatne: "\\",
  podciarnik: "_",
  podčiarnik: "_",
  underline: "_",
  otaznik: "?",
  otáznik: "?",
  vykricnik: "!",
  výkričník: "!",
  percento: "%",
  dolar: "$",
  euro: "€",
  ampersand: "&",
  asterix: "*",
};

const baseToken = (token: string) =>
  token
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

const firstChar = (token: string) =>
  token
    .trim()
    .charAt(0);

const sanitizePassword = (value: string) => {
  const tokens = value
    .replace(/[,\u2013]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return "";
  let result = "";
  for (let i = 0; i < tokens.length; i++) {
    const original = tokens[i];
    const base = baseToken(original);
    if (["velke", "velky", "velké", "veľké"].includes(base)) {
      const next = tokens[++i];
      if (next) {
        result += firstChar(next).toUpperCase();
      }
      continue;
    }
    if (["male", "maly", "malé"].includes(base)) {
      const next = tokens[++i];
      if (next) {
        result += firstChar(next).toLowerCase();
      }
      continue;
    }
    if (["cislo", "cislom", "cislica", "číslo", "číslica"].includes(base)) {
      const next = tokens[++i];
      if (next) {
        const mapped = NUMBER_WORDS[baseToken(next)];
        if (mapped) {
          result += mapped;
        } else {
          result += next.replace(/\D/g, "");
        }
      }
      continue;
    }
    if (["specialny", "special", "špeciálny", "špeciálne"].includes(base)) {
      let lookaheadIndex = i + 1;
      if (tokens[lookaheadIndex] && ["znak", "symbol"].includes(baseToken(tokens[lookaheadIndex]))) {
        lookaheadIndex++;
      }
      const next = tokens[lookaheadIndex];
      if (next) {
        const mapped = SPECIAL_WORDS[baseToken(next)];
        if (mapped) {
          result += mapped;
          i = lookaheadIndex;
          continue;
        }
      }
      continue;
    }
    const directSpecial = SPECIAL_WORDS[base];
    if (directSpecial) {
      result += directSpecial;
      continue;
    }
    if (/^\d+$/.test(original)) {
      result += original;
      continue;
    }
    result += original;
  }
  return result.trim();
};

const validateEmail = (value: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    return "Email sa mi nezdá platný. Skús ho zopakovať.";
  }
  return null;
};

const validatePasswordStrength = (value: string) => {
  const checks = [
    { ok: value.length >= 8, msg: "Heslo musí mať aspoň 8 znakov." },
    { ok: /[!@#$%^&*(),.?":{}|<>]/.test(value), msg: "Pridaj aspoň jeden špeciálny znak." },
    { ok: /\d/.test(value), msg: "Pridaj aspoň jedno číslo." },
    { ok: /[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]/.test(value), msg: "Pridaj aspoň jedno veľké písmeno." },
    { ok: /[a-záäčďéíĺľňóôŕšťúýž]/.test(value), msg: "Pridaj aspoň jedno malé písmeno." },
    
  ];
  const failed = checks.find((c) => !c.ok);
  return failed ? failed.msg : null;
};

const validateBirthdate = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "Nepočul som dátum narodenia. Skús ho zopakovať.";
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const digitsOnly = normalized.replace(/[^\d]/g, "");
  if (digitsOnly.length < 6) {
    return "Dátum znie neúplne. Skús povedať napríklad 12. január 1990.";
  }
  return null;
};

const STEP_FLOW: StepConfig[] = [
  {
    key: "firstName",
    label: "Meno",
    prompt: "Prosím, povedz svoje meno.",
    retryPrompt: "Nerozumel som menu, skús ho zopakovať.",
    maxLength: 40,
    sanitize: sanitizeName,
  },
  {
    key: "lastName",
    label: "Priezvisko",
    prompt: "Teraz povedz svoje priezvisko.",
    retryPrompt: "Nerozumel som priezvisku, povedz ho ešte raz.",
    maxLength: 50,
    sanitize: sanitizeName,
  },
  {
    key: "email",
    label: "Email",
    prompt: "Teraz povedz svoju e-mailovú adresu.",
    retryPrompt: "Emailu som nerozumel, skús ho prosím zopakovať.",
    maxLength: 80,
    sanitize: sanitizeEmail,
    validate: validateEmail,
  },
  {
    key: "password",
    label: "Heslo",
    prompt: "Prosím, nadiktuj svoje nové heslo.",
    retryPrompt: "Heslu som nerozumel, skús ho zopakovať.",
    maxLength: 72,
    sanitize: sanitizePassword,
    validate: validatePasswordStrength,
  },
  {
    key: "passwordConfirm",
    label: "Potvrdenie hesla",
    prompt: "Potvrď svoje heslo ešte raz.",
    retryPrompt: "Potvrdenie hesla nepasovalo, povedz ho prosím znova.",
    maxLength: 72,
    sanitize: sanitizePassword,
    validateWithState: (value, data) => {
      if (!data.password) return "Najprv prosím nadiktuj celé heslo.";
      if (value !== data.password) return "Heslá sa nezhodujú, skús to znova.";
      return null;
    },
  },
  {
    key: "birthdate",
    label: "Dátum narodenia",
    prompt: "Napokon povedz svoj dátum narodenia.",
    retryPrompt: "Dátumu som nerozumel, skús ho zopakovať.",
    maxLength: 60,
    sanitize: sanitizeBirthdate,
    validate: validateBirthdate,
  },
];


const hasSpeechSupport = () => {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
};

const getRecognition = (): SpeechRecognition | null => {
  if (!hasSpeechSupport()) return null;
  const ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!ctor) return null;
  const recognition = new ctor();
  recognition.lang = "sk-SK";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  return recognition;
};

type VoiceRegistrationAssistantProps = {
  onComplete?: (data: RegistrationData) => void;
  onStepResolved?: (key: StepKey, value: string) => void;
};

export function VoiceRegistrationAssistant({ onComplete, onStepResolved }: VoiceRegistrationAssistantProps) {
  const [data, setData] = useState<RegistrationData>({ ...DEFAULT_DATA });
  const [activeStep, setActiveStep] = useState(0);
  const [status, setStatus] = useState<RecStatus>("idle");
  const [activePrompt, setActivePrompt] = useState<string>("Pripravené na spustenie hlasovej registrácie.");
  const [error, setError] = useState<string>("");
  const [flowActive, setFlowActive] = useState(false);
  const [completed, setCompleted] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestManualRetry = (message: string, step: StepConfig) => {
    stopRecognition();
    setError(message);
    setActivePrompt(step.retryPrompt);
    setStatus("idle");
    setFlowActive(false);
  };

  const clearPauseTimer = () => {
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
  };

  const stopRecognition = () => {
    const rec = recognitionRef.current;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
        rec.abort?.();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    }
    clearPauseTimer();
  };

  const schedulePauseTimeout = (step: StepConfig, stepIndex: number) => {
    if (typeof window === "undefined") return;
    clearPauseTimer();
    pauseTimeoutRef.current = window.setTimeout(() => {
      recognitionRef.current?.stop();
      requestManualRetry("Nezachytil som nič. Povedz to, prosím, ešte raz.", step);
    }, 7000);
  };

  const resetFlow = () => {
    stopRecognition();
    setData({ ...DEFAULT_DATA });
    setActiveStep(0);
    setStatus("idle");
    setError("");
    setActivePrompt("Pripravené na spustenie hlasovej registrácie.");
    setFlowActive(false);
    setCompleted(false);
  };

  const validateLength = (value: string, max: number) => {
    if (value.length > max) {
      return `ZaznamenanĂ˝ text je prĂ­liĹˇ dlhĂ˝ (max ${max} znakov).`;
    }
    return null;
  };

  const handleResult = (step: StepConfig, stepIndex: number, rawValue: string) => {
    const sanitized = (step.sanitize ? step.sanitize(rawValue) : rawValue.trim()).replace(/\s+/g, " ");
    if (!sanitized) {
      requestManualRetry(step.retryPrompt, step);
      return;
    }
    const lengthError = validateLength(sanitized, step.maxLength);
    if (lengthError) {
      requestManualRetry(`${lengthError} Skús to povedať znova.`, step);
      return;
    }

    const nextData = { ...data, [step.key]: sanitized };

    if (step.validate) {
      const customError = step.validate(sanitized);
      if (customError) {
        requestManualRetry(customError, step);
        return;
      }
    }

    if (step.validateWithState) {
      const stateError = step.validateWithState(sanitized, nextData);
      if (stateError) {
        requestManualRetry(stateError, step);
        return;
      }
    }
    setData(nextData);
    setError("");
    onStepResolved?.(step.key, sanitized);

    if (step.key === "password") {
      updateControlledInput("password", sanitized);
    } else if (step.key === "passwordConfirm") {
      updateControlledInput("password_confirm", sanitized);
    } else if (step.key === "birthdate") {
      updateControlledInput("birthdate", sanitized);
    }

    const nextIndex = stepIndex + 1;
    if (nextIndex < STEP_FLOW.length) {
      setActiveStep(nextIndex);
      setActivePrompt(STEP_FLOW[nextIndex].prompt);
      startListening(STEP_FLOW[nextIndex], nextIndex);
    } else {
      setActiveStep(nextIndex);
      stopRecognition();
      setStatus("idle");
      setFlowActive(false);
      setCompleted(true);
      setActivePrompt("Ďakujeme, hlasové zadanie je pripravené na odoslanie.");
      onComplete?.(nextData);
    }
  };

  const startListening = (step: StepConfig, stepIndex: number, isRetry = false) => {
    stopRecognition();
    const recognition = getRecognition();
    if (!recognition) {
      setStatus("error");
      setError("Tento prehliadač nepodporuje Web Speech API.");
      setFlowActive(false);
      return;
    }

    setStatus("listening");
    setFlowActive(true);
    setActivePrompt(isRetry ? step.retryPrompt : step.prompt);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      clearPauseTimer();
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      setStatus("idle");
      handleResult(step, stepIndex, transcript);
    };

    recognition.onerror = () => {
      clearPauseTimer();
      setStatus("error");
      setError(step.retryPrompt);
      setFlowActive(true);
    };

    recognition.onend = () => {
      clearPauseTimer();
      setStatus((prev) => (prev === "listening" ? "idle" : prev));
    };

    recognition.start();
    recognitionRef.current = recognition;
    schedulePauseTimeout(step, stepIndex);
  };

  const startFlow = () => {
    if (!hasSpeechSupport()) {
      setError("HlasovĂ© zadĂˇvanie nie je v tomto prehliadaÄŤi dostupnĂ©.");
      return;
    }
    setCompleted(false);
    setData({ ...DEFAULT_DATA });
    setActiveStep(0);
    setFlowActive(true);
    setStatus("idle");
    setError("");
    setActivePrompt(STEP_FLOW[0].prompt);
    startListening(STEP_FLOW[0], 0);
  };

  const stopFlow = () => {
    stopRecognition();
    setFlowActive(false);
    setStatus("idle");
    setActivePrompt("Hlasová registrácia bola pozastavená.");
  };

  const retryCurrentStep = () => {
    const index = Math.min(activeStep, STEP_FLOW.length - 1);
    const step = STEP_FLOW[index];
    if (!step) return;
    startListening(step, index, true);
  };

  useEffect(() => () => stopRecognition(), []);

  const progress = useMemo(() => {
    const fraction = completed ? 1 : activeStep / STEP_FLOW.length;
    return Math.min(1, fraction);
  }, [activeStep, completed]);
  const currentStep = activeStep < STEP_FLOW.length ? STEP_FLOW[activeStep] : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Hlasová registrácia</p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Zadaj údaje postupne hlasom</h2>
          <p className="text-sm text-slate-500">
            Kliknutím spustíš záznam mikrofónu. Vedieme ťa krok za krokom.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={flowActive ? stopFlow : startFlow}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition ${
              flowActive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {flowActive ? (
              <>
                <Square size={16} />
                Zastaviť nahrávanie
              </>
            ) : (
              <>
                <Mic size={16} />
                Spustiť hlasové zadanie
              </>
            )}
          </button>
          <button
            type="button"
            onClick={resetFlow}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCcw size={16} />
            Reset
          </button>
        </div>
      </header>

      <div className="mb-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        {status === "listening"
          ? "Počúvam... pokojne dokonči vetu."
          : status === "error"
          ? "Mikrofón nahlásil chybu, spusti krok znova."
          : flowActive
          ? "Čakáme na tvoju odpoveď."
          : "Stlač tlačidlo a začni hovoriť, keď budeš pripravený."}
      </p>

            <div className="rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
        {currentStep ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Krok {activeStep + 1} z {STEP_FLOW.length}
            </p>
            <div className="mt-1 flex items-center gap-3">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{currentStep.label}</h3>
              {flowActive && (
                <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                  Aktívne nahrávanie
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{activePrompt}</p>
            {currentStep.key === "password" && (
              <ul className="mt-3 space-y-1 text-sm text-slate-500 dark:text-slate-400">
                <li>✓ Minimálne 8 znakov</li>
                <li>✓ Aspoň 1 špeciálny znak</li>
                <li>✓ Aspoň 1 číslo</li>
                <li>✓ Aspoň 1 veľké písmeno</li>
                <li>✓ Aspoň 1 malé písmeno</li>
              </ul>
            )}
          </>
        ) : (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Všetko zaznamenané</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">Hlasové odpovede sú kompletné</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Údaje môžeš ešte raz skontrolovať a potom odoslať formulár.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Postup krokov</p>
        <div className="flex flex-wrap gap-2">
          {STEP_FLOW.map((step, index) => {
            const value = data[step.key];
            const isCurrent = index === activeStep;
            const finished = Boolean(value);
            return (
              <div
                key={step.key}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs shadow-sm ${
                  finished
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/30 dark:text-emerald-100"
                    : isCurrent
                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/30 dark:text-blue-100"
                    : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                }`}
              >
                {finished ? <CheckCircle2 size={14} /> : <span className="font-semibold">{index + 1}</span>}
                <span className="font-medium">{step.label}</span>
                {finished && <span className="text-[11px] text-slate-500 dark:text-slate-300">{value}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50/60 p-4 text-sm text-orange-800 dark:border-orange-900/70 dark:bg-orange-900/20 dark:text-orange-200">
          <AlertCircle size={18} />
          <div>
            <p className="font-semibold">Prosí­m zopakuj krok</p>
            <p>{error}</p>
            <button
              type="button"
              onClick={retryCurrentStep}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-orange-600 px-3 py-1 text-xs font-semibold text-white hover:bg-orange-700"
            >
              <Mic size={14} />
              Skúsiť znova
            </button>
          </div>
        </div>
      )}

      {completed && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
          <p className="font-semibold">Hlasové údaje pripravené</p>
          <ul className="mt-2 space-y-1 text-sm">
            {STEP_FLOW.map((step) => (
              <li key={step.key}>
                <span className="font-medium">{step.label}:</span> {data[step.key] || "-"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Odošli formulár alebo údaje ešte raz potvrď manuálne, ak potrebuješ.
          </p>
        </div>
      )}

    </section>
  );
}

export default VoiceRegistrationAssistant;







