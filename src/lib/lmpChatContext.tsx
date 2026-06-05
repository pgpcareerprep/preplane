import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * LMP-level comments helpers: drawer context, mention typings, and section
 * shortcuts. All message data is sourced from the database
 * (`useLmpComments` + `useLmpProcessComment`); there is no in-memory store.
 */

export type ChatMessageType = "user" | "system";

export type ChatMention =
  | { kind: "user"; id: string; label: string }
  | { kind: "section"; id: string; label: string };

export type ChatMessage = {
  id: string;
  lmpId: string;
  ts: number;
  type: ChatMessageType;
  author: string;
  authorInitials: string;
  authorColor: string;
  text: string;
  mentions: ChatMention[];
};

export type ChatParticipant = {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: "Admin" | "Allocator" | "POC" | "Mentor";
};

export const SECTION_MENTIONS: { id: string; label: string }[] = [
  { id: "daily-progress", label: "daily progress" },
  { id: "assignment-review", label: "assignment review" },
  { id: "mentor-alignment", label: "mentor alignment" },
  { id: "pipeline", label: "pipeline" },
  { id: "checklist", label: "checklist" },
  { id: "outreach", label: "outreach" },
];

/* ───── drawer context ───── */

type Ctx = {
  openLmpId: string | null;
  open: (lmpId: string) => void;
  close: () => void;
};

const ChatCtx = createContext<Ctx | null>(null);

export function LmpChatProvider({ children }: { children: ReactNode }) {
  const [openLmpId, setOpen] = useState<string | null>(null);
  const open = useCallback((id: string) => setOpen(id), []);
  const close = useCallback(() => setOpen(null), []);
  const value = useMemo(() => ({ openLmpId, open, close }), [openLmpId, open, close]);
  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

const FALLBACK_CTX: Ctx = { openLmpId: null, open: () => {}, close: () => {} };

export function useLmpChatDrawer() {
  const ctx = useContext(ChatCtx);
  return ctx ?? FALLBACK_CTX;
}

export function formatChatTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${time}`;
}
