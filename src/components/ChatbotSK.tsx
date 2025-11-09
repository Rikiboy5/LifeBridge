import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Jednoduchý typ správy v chate
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

// Typ pre voliteľnú integračnú funkciu – môžete dodať vlastnú implementáciu
// ktorá zavolá váš backend (zachovanie funkcionality pôvodného chatbota)
export type SendMessageFn = (text: string) => Promise<string>;

// Hook pre prácu s hlasom (STT + TTS) zjednodušene na jednom mieste
function useSpeech(lang: string = 'sk-SK') {
  const [recognizing, setRecognizing] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [supported, setSupported] = useState({ stt: false, tts: false });

  // Inicializácia rozpoznávania reči
  useEffect(() => {
    const SpeechRecognitionImpl =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const sttSupported = Boolean(SpeechRecognitionImpl);
    const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setSupported({ stt: sttSupported, tts: ttsSupported });

    if (sttSupported) {
      const r: SpeechRecognition = new SpeechRecognitionImpl();
      r.lang = lang;
      r.continuous = false; // zjednodušené – ukončí sa po vete
      r.interimResults = false; // chceme iba finálny text
      recognitionRef.current = r;
    }
  }, [lang]);

  // Spustenie rozpoznávania reči – vráti Promise s rozpoznaným textom
  const startRecognition = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const r = recognitionRef.current;
      if (!r) {
        reject(new Error('Rozpoznávanie reči nie je podporované v tomto prehliadači.'));
        return;
      }
      setRecognizing(true);
      r.onresult = (e) => {
        const transcript = Array.from(e.results)
          .map((res) => res[0]?.transcript ?? '')
          .join(' ')
          .trim();
        resolve(transcript);
      };
      r.onerror = (e) => {
        reject(new Error((e as any)?.error || 'Chyba rozpoznávania reči'));
      };
      r.onend = () => setRecognizing(false);
      try {
        r.start();
      } catch (err) {
        setRecognizing(false);
        reject(err);
      }
    });
  }, []);

  // Prehrávanie textu hlasom
  const speak = useCallback(
    (text: string, opts?: { rate?: number; pitch?: number; volume?: number; voiceName?: string }) => {
      if (!supported.tts) return;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      // jemne pomalšie a zrozumiteľné defaulty
      utter.rate = opts?.rate ?? 0.95;
      utter.pitch = opts?.pitch ?? 1.0;
      utter.volume = opts?.volume ?? 1.0;

      // Výber slovenskej hlasovej stopy, ak je dostupná
      const pickVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        let v = voices.find((vv) => vv.lang?.toLowerCase().startsWith('sk'));
        if (!v && opts?.voiceName) {
          v = voices.find((vv) => vv.name === opts.voiceName);
        }
        if (!v) {
          // fallback – ak nie je slovenský hlas, ponecháme default
          return;
        }
        utter.voice = v;
      };

      // Niektoré prehliadače načítajú hlasy asynchrónne
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = () => {
          pickVoice();
          window.speechSynthesis.speak(utter);
        };
      } else {
        pickVoice();
        window.speechSynthesis.speak(utter);
      }
    },
    [lang, supported.tts]
  );

  return {
    supported,
    recognizing,
    startRecognition,
    speak,
  };
}

// Hlavný komponent chatbota – slovenské UI, responzívny, s komentármi
export default function ChatbotSK({ sendMessage }: { sendMessage?: SendMessageFn }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'sys-1',
      role: 'system',
      content:
        'Ahoj! Som tvoj slovenský asistent. Môžeš písať alebo hovoriť. Ako ti pomôžem?',
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true); // automaticky číta odpovede
  const { supported, recognizing, startRecognition, speak } = useSpeech('sk-SK');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll na najnovšiu správu
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  // Lokálna utilita – odošle správu a spracuje odpoveď
  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setLoading(true);

      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');

      try {
        let reply = '';
        if (sendMessage) {
          // Preferujte injektovanú integračnú funkciu – zachová to pôvodné napojenie
          reply = await sendMessage(trimmed);
        } else {
          // Jednoduchý fallback na vaše API – prispôsobte si, ak máte iný endpoint
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: trimmed, lang: 'sk' }),
          });
          if (!res.ok) throw new Error('Chyba komunikácie s API');
          const data = await res.json();
          reply = data?.reply ?? '';
        }

        const botMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: reply || 'Prepáč, nepochopil som. Skús to, prosím, zopakovať.',
        };
        setMessages((prev) => [...prev, botMsg]);

        if (autoSpeak && botMsg.content) {
          speak(botMsg.content);
        }
      } catch (err: any) {
        const botMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Nastala chyba pri spracovaní požiadavky. Skús neskôr, prosím.',
        };
        setMessages((prev) => [...prev, botMsg]);
      } finally {
        setLoading(false);
      }
    },
    [autoSpeak, loading, sendMessage, speak]
  );

  // Vyvolanie rozpoznávania hlasu a automatické poslanie výsledku
  const handleMicClick = useCallback(async () => {
    if (!supported.stt) return;
    try {
      const transcript = await startRecognition();
      if (transcript) {
        await handleSend(transcript);
      }
    } catch (err) {
      // prípadné chyby STT ignorujeme v UI
    }
  }, [handleSend, startRecognition, supported.stt]);

  // Jednoduché, responzívne štýly – využíva flex a max šírky
  const styles = useMemo(
    () => ({
      wrap: {
        width: '100%',
        maxWidth: 720,
        margin: '0 auto',
        height: '100%',
        display: 'flex',
        flexDirection: 'column' as const,
      },
      header: {
        padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      },
      title: { fontSize: 18, fontWeight: 600 },
      toggles: { display: 'flex', alignItems: 'center', gap: 12 },
      chat: {
        flex: 1,
        overflowY: 'auto' as const,
        padding: 12,
        background: '#fafafa',
      },
      msg: {
        maxWidth: '85%',
        padding: '10px 12px',
        borderRadius: 12,
        marginBottom: 8,
        lineHeight: 1.35,
        wordBreak: 'break-word' as const,
        whiteSpace: 'pre-wrap' as const,
      },
      user: { background: '#DCFCE7', marginLeft: 'auto' },
      bot: { background: '#fff', border: '1px solid #e5e7eb' },
      footer: {
        borderTop: '1px solid #e5e7eb',
        padding: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      },
      input: {
        flex: 1,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid #d1d5db',
        outline: 'none',
        fontSize: 14,
      },
      btn: {
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid #d1d5db',
        background: '#ffffff',
        cursor: 'pointer',
      },
      btnPrimary: {
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid #16a34a',
        background: '#16a34a',
        color: '#fff',
        cursor: 'pointer',
      },
      info: { color: '#6b7280', fontSize: 12 },
    }),
    []
  );

  return (
    <div style={styles.wrap}>
      {/* Hlavička s názvom a prepínačom hlasového výstupu */}
      <div style={styles.header}>
        <div style={styles.title}>Slovenský Chatbot</div>
        <div style={styles.toggles}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => setAutoSpeak(e.target.checked)}
            />
            <span>Čítať odpovede</span>
          </label>
          {!supported.stt && (
            <span style={styles.info}>Mikrofón nepodporovaný v tomto prehliadači</span>
          )}
        </div>
      </div>

      {/* Oblasť konverzácie */}
      <div ref={scrollRef} style={styles.chat}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              ...styles.msg,
              ...(m.role === 'user' ? styles.user : styles.bot),
            }}
            aria-live={m.role === 'assistant' ? 'polite' : undefined}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ ...styles.msg, ...styles.bot }}>Píšem odpoveď…</div>
        )}
      </div>

      {/* Spodný vstup – text, mikrofón a odoslať */}
      <form
        style={styles.footer}
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
      >
        <input
          style={styles.input}
          placeholder="Napíš správu…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="button"
          style={styles.btn}
          onClick={handleMicClick}
          disabled={!supported.stt || recognizing || loading}
          title={supported.stt ? 'Nahrať hlas' : 'Mikrofón nepodporovaný'}
        >
          {recognizing ? 'Počúvam…' : '🎤'}
        </button>
        <button type="submit" style={styles.btnPrimary} disabled={loading || !input.trim()}>
          Poslať
        </button>
      </form>

      {/* Pomocný text k používaniu hlasu */}
      <div style={{ padding: '6px 12px' }}>
        <div style={styles.info}>
          Tip: Klikni na 🎤 a rozprávaj. Pre lepšiu výslovnosť odpovedí ponechaj
          zapnuté „Čítať odpovede“.
        </div>
      </div>
    </div>
  );
}

