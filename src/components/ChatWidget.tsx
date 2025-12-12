import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useChat } from "./ChatContext";
import { MessageCircle } from "lucide-react";

type MatchUser = {
  id_user: number;
  meno: string;
  priezvisko: string;
  similarity_percent?: number | null;
};

type Member = {
  id_user: number;
  meno: string;
  priezvisko: string;
};

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_URL ?? "http://127.0.0.1:5000";

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
    createGroupConversation,
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

  const [mode, setMode] = useState<"inbox" | "create_group">("inbox");
  const [groupTitle, setGroupTitle] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [matchUsers, setMatchUsers] = useState<MatchUser[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!isOpen || !activeConversationId) return;
    const el = messagesContainerRef.current;
    if (!el) return;

    el.scrollTop = el.scrollHeight;
  }, [isOpen, activeConversationId, messages.length]);

  useEffect(() => {
    const uid = currentUserId;
    if (mode !== "create_group") return;
    if (!uid) {
      setMatchUsers([]);
      setMatchError("Najprv sa prihlás.");
      return;
    }

    let cancelled = false;

    const run = async () => {
      setMatchLoading(true);
      setMatchError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/match/${uid}?top_n=50&distance_km=100`);
        console.log("[CHAT][GROUP] candidates loaded", {
          top_n: 50,
          distance_km: 100,
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Nepodarilo sa načítať match zoznam.");
        }
        const data: MatchUser[] = await res.json();
        if (!cancelled) setMatchUsers(data);
      } catch (e: any) {
        if (!cancelled) {
          setMatchUsers([]);
          setMatchError(e?.message || "Nepodarilo sa načítať match zoznam.");
        }
      } finally {
        if (!cancelled) setMatchLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [mode, currentUserId]);

  const filteredMatchUsers = useMemo(() => {
  const term = memberSearch.trim().toLowerCase();
  const base = term ? matchUsers : matchUsers.slice(0, 50);
  if (!term) return base;
  return base.filter((u) => {
    const full = `${u.meno} ${u.priezvisko}`.toLowerCase();
    return full.includes(term);
  });
  }, [matchUsers, memberSearch]);

  const canCreateGroup =
    currentUserId != null &&
    groupTitle.trim().length > 0 &&
    selectedMemberIds.length >= 2;

  const toggleMember = (userId: number) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]
    );
  };

  const handleCreateGroup = async () => {
    if (!canCreateGroup) return;
    await createGroupConversation(selectedMemberIds, groupTitle);
    setMode("inbox");
    setGroupTitle("");
    setMemberSearch("");
    setSelectedMemberIds([]);
  };

  const activeConv = useMemo(
    () => conversations.find((c) => c.id_conversation === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const activeParticipantCount = useMemo(() => {
    if (!activeConv?.participant_ids) return 0;
    return activeConv.participant_ids.split(",").map((s) => s.trim()).filter(Boolean).length;
  }, [activeConv]);

  const isActiveGroup = activeParticipantCount > 2;

  const loadMembers = async (convId: number) => {
    if (!currentUserId) {
      setMembersError("Najprv sa prihlás.");
      return;
    }
    setMembersLoading(true);
    setMembersError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/chat/conversations/${convId}/participants?user_id=${currentUserId}`
      );
      if (!res.ok) throw new Error(await res.text());
      const data: Member[] = await res.json();
      setMembers(data);
    } catch (e: any) {
      setMembers([]);
      setMembersError(e?.message || "Nepodarilo sa načítať členov.");
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    setMembersOpen(false);
    setMembers([]);
    setMembersError(null);
  }, [activeConversationId]);

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

      <div className="fixed bottom-24 right-4 w-[480px] h-[640px] max-w-[92vw] max-h-[72vh] bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl shadow-2xl flex flex-col z-40 text-base">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg">Správy</span>

            {mode === "inbox" ? (
              <button
                type="button"
                disabled={!currentUserId}
                onClick={() => {
                  if (!currentUserId) return;
                  setMode("create_group");
                  setGroupTitle("");
                  setMemberSearch("");
                  setSelectedMemberIds([]);
                  setMatchError(null);
                  console.log("[CHAT][GROUP] open create_group");
                }}
                className={`text-sm px-3 py-1 rounded-md border ${
                  !currentUserId
                    ? "opacity-50 cursor-not-allowed border-gray-300 dark:border-gray-700"
                    : "border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
                title={!currentUserId ? "Najprv sa prihlás" : "Vytvoriť skupinový chat"}
              >
                + Skupina
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode("inbox")}
                className="text-sm px-3 py-1 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                ← Späť
              </button>
            )}
          </div>

          <button
            onClick={closeChat}
            className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Zavrieť
          </button>
        </div>

        {mode === "create_group" ? (
          <div className="flex-1 min-h-0 p-4 flex flex-col gap-4">
            {/* Názov skupiny */}
            <div>
              <label className="block text-sm font-semibold mb-1">Názov skupiny</label>
              <input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                placeholder="napr. Náš tím"
              />
              <div className="mt-1 text-xs text-gray-500">
                Vyber aspoň <b>2</b> ďalších členov (spolu min. 3 ľudia).
              </div>
            </div>

            {/* Vybraní členovia */}
            {selectedMemberIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedMemberIds.map((id) => {
                  const u = matchUsers.find((x) => x.id_user === id);
                  const label = u ? `${u.meno} ${u.priezvisko}` : `#${id}`;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleMember(id)}
                      className="text-xs px-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                      title="Odobrať"
                    >
                      {label} ✕
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search */}
            <div>
              <label className="block text-sm font-semibold mb-1">Pridať členov</label>
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                placeholder="Hľadať podľa mena…"
              />
            </div>

            {/* Match list */}
            <div className="flex-1 min-h-0 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="h-full overflow-y-auto">
                {matchLoading && (
                  <div className="p-3 text-sm text-gray-500">Načítavam odporúčania…</div>
                )}

                {!matchLoading && matchError && (
                  <div className="p-3 text-sm text-red-500">{matchError}</div>
                )}

                {!matchLoading && !matchError && (
                  <>
                    {filteredMatchUsers
                      .filter((u) => u.id_user !== currentUserId)
                      .map((u) => {
                        const selected = selectedMemberIds.includes(u.id_user);
                        return (
                          <button
                            key={u.id_user}
                            type="button"
                            onClick={() => toggleMember(u.id_user)}
                            className={`w-full px-3 py-3 text-left flex items-center justify-between gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                              selected ? "bg-gray-100 dark:bg-gray-800" : ""
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">
                                {u.meno} {u.priezvisko}
                              </div>
                              <div className="text-xs text-gray-500">
                                Zhoda: {u.similarity_percent ?? "?"}%
                              </div>
                            </div>

                            <div
                              className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${
                                selected
                                  ? "bg-blue-600 border-blue-600 text-white"
                                  : "border-gray-300 dark:border-gray-700"
                              }`}
                              aria-hidden
                            >
                              {selected ? "✓" : ""}
                            </div>
                          </button>
                        );
                      })}

                    {!matchLoading &&
                      !matchError &&
                      filteredMatchUsers.filter((u) => u.id_user !== currentUserId).length === 0 && (
                        <div className="p-3 text-sm text-gray-500">Nikto sa nenašiel.</div>
                      )}
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setMode("inbox")}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Zrušiť
              </button>
              <button
                type="button"
                disabled={!canCreateGroup}
                onClick={handleCreateGroup}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold ${
                  !canCreateGroup
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                Vytvoriť skupinu
              </button>
            </div>
          </div>
        ) : (
          // ✅ INBOX UI
          <div className="flex flex-1 min-h-0 text-base">
            {/* zoznam konverzácií */}
            <div className="w-40 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
              {conversations.length === 0 && (
                <div className="p-3 text-sm text-gray-500">Žiadne konverzácie</div>
              )}
              {conversations.map((conv) => {
                const isActive = conv.id_conversation === activeConversationId;

                const title =
                  (conv.display_title && String(conv.display_title).trim().length > 0
                    ? String(conv.display_title)
                    : conv.title && String(conv.title).trim().length > 0
                    ? String(conv.title)
                    : conv.other_user_name && conv.other_user_name.trim().length > 0
                    ? conv.other_user_name
                    : `Konverzácia #${conv.id_conversation}`);

                return (
                  <button
                    key={conv.id_conversation}
                    onClick={() => selectConversation(conv.id_conversation)}
                    className={`w-full text-left px-3 py-2 truncate hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      isActive ? "bg-gray-100 dark:bg-gray-800" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm truncate">{title}</div>
                      {conv.unread_count && conv.unread_count > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs px-2 py-0.5">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* správy */}
            <div className="flex-1 flex flex-col relative">
              {activeConversationId != null && (
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <div className="text-sm font-semibold truncate">
                    {activeConv?.display_title ??
                      activeConv?.title ??
                      activeConv?.other_user_name ??
                      "Konverzácia"}
                  </div>

                  {isActiveGroup && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = !membersOpen;
                        setMembersOpen(next);
                        if (next) loadMembers(activeConversationId);
                        console.log("[CHAT][GROUP] toggle members", next);
                      }}
                      className="text-sm px-3 py-1 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      Členovia
                    </button>
                  )}
                </div>
              )}

              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                {membersOpen && (
                  <div className="absolute inset-0 bg-white dark:bg-gray-900 z-10 flex flex-col">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <div className="text-lg font-semibold">Členovia skupiny</div>
                      <button
                        type="button"
                        onClick={() => setMembersOpen(false)}
                        className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                      >
                        Zavrieť
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3">
                      {membersLoading && <div className="text-sm text-gray-500">Načítavam…</div>}
                      {!membersLoading && membersError && (
                        <div className="text-sm text-red-500">{membersError}</div>
                      )}

                      {!membersLoading && !membersError && (
                        <div className="space-y-2">
                          {members.map((m) => (
                            <a
                              key={m.id_user}
                              href={`/user/${m.id_user}`}
                              className="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                            >
                              {m.meno} {m.priezvisko}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeConversationId == null && (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500 text-center">
                    Vyber konverzáciu vľavo alebo otvor profil používateľa a klikni na „Napísať správu“.
                  </div>
                )}

                {activeConversationId != null && messages.length === 0 && (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
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
                        className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-snug mb-1 ${
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
                              className="w-full text-sm bg-transparent border-b border-white/50 dark:border-gray-500 focus:outline-none"
                            />
                            <div className="flex justify-end gap-3 mt-2 text-xs">
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
                            <div className="flex items-center justify-between mt-1 text-xs opacity-70">
                              <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                              <span>{m.is_edited ? "upravené" : ""}</span>
                            </div>
                            {isMine && (
                              <button
                                type="button"
                                className="mt-1 text-xs opacity-80 hover:opacity-100"
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
                  className="border-t border-gray-200 dark:border-gray-700 p-3 flex gap-3"
                >
                  <input
                    className="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Napíš správu..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={isSendDisabled}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${
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
        )}
      </div>
    </>
  );
}