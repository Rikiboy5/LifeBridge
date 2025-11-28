import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from "react";
import type { ReactNode } from "react";

type Conversation = {
  id_conversation: number;
  last_message_at: string | null;
  last_message: string | null;
  participant_ids: string;
  other_user_id?: number | null;
  other_user_name?: string | null;
  unread_count?: number | null;
};

type Message = {
  id_message: number;
  sender_id: number;
  content: string;
  created_at: string;
  meno?: string;
  priezvisko?: string;
  is_edited?: boolean;
  edited_at?: string;
};

type ChatContextValue = {
  conversations: Conversation[];
  activeConversationId: number | null;
  messages: Message[];
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  selectConversation: (conversationId: number) => void;
  openConversationWithUser: (otherUserId: number) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
  editMessage: (messageId: number, newText: string) => Promise<void>;
  resetChat: () => void;
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000"; // uprav podľa projektu

// získanie prihláseného usera – prispôsob si podľa toho, ako to máš riešené
const getCurrentUserId = (): number | null => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    // backend pri logine vracia "id", ale keby si to menil, fallback je aj na id_user
    return u?.id ?? u?.id_user ?? null;
  } catch {
    return null;
  }
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const resetChat = () => {
    setConversations([]);
    setMessages([]);
    setActiveConversationId(null);
    setIsOpen(false);
    lastTotalUnreadRef.current = 0;
  };

  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastTotalUnreadRef = useRef(0);

  const refreshConversations = async () => {
    const currentUserId = getCurrentUserId();
    console.log("[CHAT] refreshConversations -> currentUserId =", currentUserId);
    if (!currentUserId) return;

    const res = await fetch(
      `${API_BASE_URL}/api/chat/conversations?user_id=${currentUserId}`
    );
    if (!res.ok) return;
    const data: Conversation[] = await res.json();
    setConversations(data);

    // spočítaj total unread z nových dát
    const newTotalUnread = data.reduce(
      (sum, c) => sum + (c.unread_count ?? 0),
      0
    );

    console.log(
      "[CHAT] conversations loaded:",
      data.length,
      "totalUnread =",
      newTotalUnread
    );

    const prevTotalUnread = lastTotalUnreadRef.current;

    // ak pribudli nové neprečítané správy a widget je zavretý -> ping
    if (newTotalUnread > prevTotalUnread && !isOpen) {
      console.log(
        "[CHAT] new unread messages detected:",
        "prevTotalUnread =",
        prevTotalUnread,
        "newTotalUnread =",
        newTotalUnread
      );
      const audio = notificationAudioRef.current;
      if (audio) {
        // niektoré prehliadače blokujú autoplay bez interakcie, ale po prvom kliku by to malo ísť
        audio
          .play().catch((err) => {
            // ticho ignoruj chybu (napr. blokovaný autoplay)
            console.warn("[CHAT] audio play blocked:", err);
          });
      }
    }

    // ulož nový stav
    lastTotalUnreadRef.current = newTotalUnread;
  };

  const loadMessages = async (conversationId: number) => {
    const currentUserId = getCurrentUserId();
    const url =
      currentUserId != null
        ? `${API_BASE_URL}/api/chat/conversations/${conversationId}/messages?user_id=${currentUserId}`
        : `${API_BASE_URL}/api/chat/conversations/${conversationId}/messages`;

    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data);
  };

  const selectConversation = async (conversationId: number) => {
    setActiveConversationId(conversationId);
    await loadMessages(conversationId);
  };

    const openConversationWithUser = async (otherUserId: number) => {
      const currentUserId = getCurrentUserId();

      if (!currentUserId) {
          console.warn("openConversationWithUser: currentUserId je null");
          // aj tak otvoríme widget – user aspoň uvidí, že má byť prihlásený
          setIsOpen(true);
          return;
      }

      setIsOpen(true);

      try {
          const res = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              user_ids: [currentUserId, otherUserId],
          }),
          });

          if (!res.ok) {
          console.error("openConversationWithUser: chyba odpovede", res.status);
          return;
          }

          const data = await res.json();
          console.log("openConversationWithUser: response data", data);

          const convId = data.id_conversation as number;
          await refreshConversations();
          await selectConversation(convId);
      } catch (err) {
          console.error("openConversationWithUser: exception", err);
      }
    };

    const sendMessage = async (text: string) => {
        const currentUserId = getCurrentUserId();
        if (!currentUserId || !activeConversationId) return;

        const trimmed = text.trim();
        if (!trimmed) return;

        const res = await fetch(
            `${API_BASE_URL}/api/chat/conversations/${activeConversationId}/messages`,
            {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sender_id: currentUserId,
                content: trimmed,
            }),
            }
        );

        if (!res.ok) return;

        await loadMessages(activeConversationId);
        await refreshConversations();
    };

      const editMessage = async (messageId: number, newText: string) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return;

    const trimmed = newText.trim();
    if (!trimmed) return;

    const res = await fetch(`${API_BASE_URL}/api/chat/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sender_id: currentUserId,
        content: trimmed,
      }),
    });

    if (!res.ok) return;

    if (activeConversationId) {
      await loadMessages(activeConversationId);
      await refreshConversations();
    }
  };

  const openChat = () => {
    setIsOpen(true);
    refreshConversations();
  };

  const closeChat = () => {
    setIsOpen(false);
  };

  // jednoduchý periodický refresh správ pri otvorenom chate a vybratej konverzácii
  useEffect(() => {
    if (!isOpen || !activeConversationId) return;
    console.log(
      "[CHAT] start 3s interval (widget OPEN, convId =",
      activeConversationId,
      ")"
    );
    const intervalId = setInterval(() => {
      console.log(
        "[CHAT] ⏱ 3s tick -> loadMessages + refreshConversations (convId =",
        activeConversationId,
        ")"
      );
      loadMessages(activeConversationId);
      refreshConversations();
    }, 3000); // 3 sekundy
    return () => {
      console.log("[CHAT] clear 3s interval (widget CLOSE / conv change)");
      clearInterval(intervalId);
    };
  }, [isOpen, activeConversationId]);

  // Globálny refresh inboxu každých 15 sekúnd (aj keď je widget zatvorený)
  useEffect(() => {
    console.log("[CHAT] start 15s global interval (inbox refresh)");
    // jedna kontrola hneď po mount-e
    const initialUserId = getCurrentUserId();
    if (initialUserId) {
      console.log(
        "[CHAT] ⏱ initial -> refreshConversations (global, userId =",
        initialUserId,
        ")"
      );
      refreshConversations();
    } else {
      console.log("[CHAT] ⏱ initial skipped - no user");
    }
    const intervalId = setInterval(() => {
      const currentUserId = getCurrentUserId();
      if (!currentUserId) {
        console.log("[CHAT] ⏱ 15s tick skipped - no user");
        return;
      }
      console.log(
        "[CHAT] ⏱ 15s tick -> refreshConversations (global, userId =",
        currentUserId,
        ")"
      );
      refreshConversations();
    }, 15000); // 15 sekúnd
    return () => {
      console.log("[CHAT] clear 15s global interval (unmount ChatProvider)");
      clearInterval(intervalId);
    };
  }, []);

  // zvuk pri nových správach
  useEffect(() => {
    // načítame zvukový súbor, keď sa provider namountuje
    const audio = new Audio("/new_msg.mp3");
    notificationAudioRef.current = audio;
  }, []);

  const value: ChatContextValue = {
    conversations,
    activeConversationId,
    messages,
    isOpen,
    openChat,
    closeChat,
    selectConversation,
    openConversationWithUser,
    sendMessage,
    refreshConversations,
    editMessage,
    resetChat,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return ctx;
};