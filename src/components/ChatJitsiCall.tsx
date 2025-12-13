import React, { useEffect } from "react";

type ChatJitsiCallProps = {
  /** Názov miestnosti – napr. "lifebridge-conversation-123" */
  roomName: string | null;
  /** Či je videookno otvorené */
  isOpen: boolean;
  /** Zavretie modalu (X tlačidlo / klik mimo, podľa toho ako použiješ) */
  onClose: () => void;
};

/** Komponenta nič nevykresľuje – len sleduje isOpen + roomName
    a keď sú nastavené, otvorí Jitsi meeting v novom okne / tabe. */
export function ChatJitsiCall({ roomName, isOpen, onClose }: ChatJitsiCallProps) {
  useEffect(() => {
    if (!isOpen || !roomName) return;
    if (typeof window === "undefined") return;

    const jitsiUrl = `https://meet.jit.si/${encodeURIComponent(roomName)}`;
    console.log("[CHAT][VIDEO] opening Jitsi window:", jitsiUrl);

    window.open(jitsiUrl, "_blank", "noopener,noreferrer");

    // po otvorení okna hneď zavrieme "video stav" v chate
    onClose();
  }, [isOpen, roomName, onClose]);

  // žiadny modal, žiadny iframe – všetko beží v novom okne
  return null;
}

export default ChatJitsiCall;