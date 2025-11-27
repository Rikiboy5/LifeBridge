import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useChat } from "./ChatContext";
import { MessageCircle } from "lucide-react";

const getCurrentUserId = () => {
  try {
    const stored = localStorage.getItem("user"); // rovnaký kľúč ako pri logine
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    // backend pri logine vracia "id", ale fallback na id_user nechávame
    return parsed?.id ?? parsed?.id_user ?? null;
  } catch {
    return null;
  }
};

export default function ChatWidget() {
  const {
    conversations,
    activeConversationId,
    messages,
    isOpen,
    openChat,
    closeChat,
    selectConversation,
    sendMessage,
    editMessage,
  } = useChat();

  const [draft, setDraft] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const currentUserId = getCurrentUserId();
  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (sum, c) => sum + (c.unread_count ?? 0),
        0
      ),
    [conversations]
  );

  const isSendDisabled = !draft.trim() || activeConversationId == null;

  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState("");

  useEffect(() => {
    if (!isOpen || !activeConversationId) return;
    const el = messagesContainerRef.current;
    if (!el) return;

    el.scrollTop = el.scrollHeight;
  }, [isOpen, activeConversationId, messages.length]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || activeConversationId == null) return;
    await sendMessage(draft);
    setDraft("");
  };

  // bublina nad AI widgetom (AI nechávame dole)
  if (!isOpen) {
    return (
      <button
        onClick={openChat}
        aria-label="Otvoriť chat"
        className="fixed bottom-20 right-3 w-14 h-14 rounded-full shadow-lg bg-blue-600 text-white flex items-center justify-center z-40"
      >
        <MessageCircle className="w-6 h-6" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] px-1.5 py-0.5">
            {totalUnread}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      {/* bublina zostane aj pri otvorenom okne, môžeš ju schovať ak chceš */}
      <button
        onClick={closeChat}
        aria-label="Zavrieť chat"
        className="fixed bottom-20 right-3 w-14 h-14 rounded-full shadow-lg bg-blue-600 text-white flex items-center justify-center text-lg z-40"
      >
        ✕
      </button>

      <div className="fixed bottom-24 right-4 w-[360px] h-[480px] bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl shadow-2xl flex flex-col z-40">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="font-semibold text-sm">Správy</span>
          <button
            onClick={closeChat}
            className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Zavrieť
          </button>
        </div>

        <div className="flex flex-1 min-h-0 text-sm">
          {/* zoznam konverzácií */}
          <div className="w-32 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            {conversations.length === 0 && (
              <div className="p-2 text-xs text-gray-500">Žiadne konverzácie</div>
            )}
            {conversations.map((conv) => {
              const isActive = conv.id_conversation === activeConversationId;

              const title =
                conv.other_user_name && conv.other_user_name.trim().length > 0
                  ? conv.other_user_name
                  : `Konverzácia #${conv.id_conversation}`;

              return (
                <button
                  key={conv.id_conversation}
                  onClick={() => selectConversation(conv.id_conversation)}
                  className={`w-full text-left px-2 py-1 truncate hover:bg-gray-100 dark:hover:bg-gray-800 ${
                    isActive ? "bg-gray-100 dark:bg-gray-800" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="font-semibold text-[11px] truncate">{title}</div>
                    {conv.unread_count && conv.unread_count > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] px-1.5 py-0.5">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* správy */}
          <div className="flex-1 flex flex-col">
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-2 space-y-1"
            >
              {activeConversationId == null && (
                <div className="h-full flex items-center justify-center text-xs text-gray-500 text-center">
                  Vyber konverzáciu vľavo alebo otvor profil používateľa a klikni
                  na „Napísať správu“.
                </div>
              )}

              {activeConversationId != null && messages.length === 0 && (
                <div className="h-full flex items-center justify-center text-xs text-gray-500">
                  Zatiaľ tu nie sú žiadne správy. Napíš prvú 👋
                </div>
              )}

              {activeConversationId != null &&
                messages.length > 0 &&
                messages.map((m) => {
                  const isMine = currentUserId != null && m.sender_id === currentUserId;
                  const isEditing = editingMessageId === m.id_message;

                  return (
                    <div
                      key={m.id_message}
                      className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs leading-snug mb-1 ${
                        isMine
                          ? "ml-auto bg-blue-600 text-white rounded-bl-2xl rounded-tl-2xl"
                          : "mr-auto bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-br-2xl rounded-tr-2xl"
                      }`}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            await editMessage(m.id_message, editingDraft);
                            setEditingMessageId(null);
                            setEditingDraft("");
                          }}
                        >
                          <input
                            autoFocus
                            value={editingDraft}
                            onChange={(e) => setEditingDraft(e.target.value)}
                            className="w-full text-xs bg-transparent border-b border-white/50 dark:border-gray-500 focus:outline-none"
                          />
                          <div className="flex justify-end gap-2 mt-1 text-[9px]">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessageId(null);
                                setEditingDraft("");
                              }}
                            >
                              Zrušiť
                            </button>
                            <button type="submit">Uložiť</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div>{m.content}</div>
                          <div className="flex items-center justify-between mt-0.5 text-[9px] opacity-70">
                            <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                            <span>{m.is_edited ? "upravené" : ""}</span>
                          </div>
                          {isMine && (
                            <button
                              type="button"
                              className="mt-0.5 text-[9px] opacity-80 hover:opacity-100"
                              onClick={() => {
                                setEditingMessageId(m.id_message);
                                setEditingDraft(m.content);
                              }}
                            >
                              Upraviť
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* input na novú správu */}
            {activeConversationId != null && (
              <form
                onSubmit={handleSubmit}
                className="border-t border-gray-200 dark:border-gray-700 p-2 flex gap-2"
              >
                <input
                  className="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-xs dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Napíš správu..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={isSendDisabled}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    isSendDisabled
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Poslať
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}