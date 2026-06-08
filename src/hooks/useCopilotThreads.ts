import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type MentionEntity } from "@/components/copilot/MentionDropdown";

export type Attachment = {
  name: string;
  type: string;
  content: string;
};

export type ChatMessage =
  | { id: string; role: "user"; content: string; ts: number; mentions?: MentionEntity[]; attachments?: Attachment[] }
  | { id: string; role: "assistant"; content: string; ts: number; streaming?: boolean }
  | { id: string; role: "note"; content: string; ts: number };

export type ChatThread = {
  id: string;
  title: string;
  group: "Today" | "Yesterday" | "Earlier";
  messages: ChatMessage[];
  lastMessageAt?: number;
};

function bucketGroup(ts: number): "Today" | "Yesterday" | "Earlier" {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  if (ts >= startOfToday) return "Today";
  if (ts >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

const NEW_THREAD_TITLE = "New chat";

/**
 * Persistent Copilot threads + messages.
 * - Threads are filtered to non-expired only (expires_at > now()).
 * - Messages are loaded lazily per-thread (not bulk on hydration).
 * - Falls back to in-memory only if the user is unauthenticated.
 */
export function useCopilotThreads(lmpId?: string | null) {
  const scopedLmpId = lmpId ?? null;
  const [threads, setThreads] = useState<ChatThread[]>([
    { id: "local-new", title: NEW_THREAD_TITLE, group: "Today", messages: [] },
  ]);
  const [activeId, setActiveId] = useState<string>("local-new");
  const [hydrated, setHydrated] = useState(false);
  const userIdRef = useRef<string | null>(null);
  // Tracks threads currently being fetched to prevent concurrent duplicate requests.
  const fetchingRef = useRef<Set<string>>(new Set());

  // BUG-FIX #7: clear the UI buffer the moment the LMP scope changes so the
  // previous LMP's transcript can't bleed into the new conversation while the
  // hydrate effect below is still fetching. DB threads are untouched.
  useEffect(() => {
    setThreads([{ id: "local-new", title: NEW_THREAD_TITLE, group: "Today", messages: [] }]);
    setActiveId("local-new");
    setHydrated(false);
  }, [scopedLmpId]);

  // Initial load — only fetches thread metadata, NOT messages (lazy).
  // Filters to non-expired threads only (expires_at > now()).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      userIdRef.current = uid;

      let q = supabase
        .from("copilot_threads")
        .select("id,title,last_message_at,created_at,expires_at,metadata")
        .gt("expires_at", new Date().toISOString())   // 7-day filter: exclude expired threads
        .order("last_message_at", { ascending: false })
        .limit(50);

      if (scopedLmpId) {
        q = q.contains("metadata", { lmp_id: scopedLmpId } as any);
      } else {
        // Global drawer: only threads without an lmp scope
        q = q.or("metadata->>lmp_id.is.null");
      }

      const { data: tRows, error: tErr } = await q;

      if (cancelled) return;
      if (tErr || !tRows || tRows.length === 0) {
        // Create an initial thread.
        await ensureThread(uid).then((id) => {
          if (cancelled) return;
          setThreads([{ id, title: NEW_THREAD_TITLE, group: "Today", messages: [] }]);
          setActiveId(id);
          setHydrated(true);
        });
        return;
      }

      // Build thread list WITHOUT bulk-fetching all messages.
      // Messages are loaded lazily when a thread is first activated.
      const built: ChatThread[] = tRows.map((t) => ({
        id: t.id,
        title: t.title || NEW_THREAD_TITLE,
        group: bucketGroup(new Date(t.last_message_at).getTime()),
        messages: [],   // lazy — fetched on demand by fetchMessagesForThread
        lastMessageAt: new Date(t.last_message_at).getTime(),
      }));

      setThreads(built);
      setActiveId(built[0].id);
      setHydrated(true);
    })().catch((e) => {
      console.warn("[copilot-threads] hydrate failed:", e);
      setHydrated(true);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedLmpId]);

  const ensureThread = useCallback(async (uid: string | null): Promise<string> => {
    const { data, error } = await supabase
      .from("copilot_threads")
      .insert({
        user_id: uid,
        title: NEW_THREAD_TITLE,
        metadata: scopedLmpId ? { lmp_id: scopedLmpId } : {},
        // expires_at defaults to now() + 7 days via the DB column default
      } as any)
      .select("id")
      .single();
    if (error || !data) throw error || new Error("ensure thread failed");
    return data.id;
  }, [scopedLmpId]);

  const newChat = useCallback(async () => {
    try {
      const id = await ensureThread(userIdRef.current);
      setThreads((prev) => [{ id, title: NEW_THREAD_TITLE, group: "Today", messages: [] }, ...prev]);
      setActiveId(id);
      return id;
    } catch (e) {
      console.warn("[copilot-threads] newChat failed:", e);
      const id = `local-${Date.now()}`;
      setThreads((prev) => [{ id, title: NEW_THREAD_TITLE, group: "Today", messages: [] }, ...prev]);
      setActiveId(id);
      return id;
    }
  }, [ensureThread]);

  const renameThreadIfNew = useCallback(async (threadId: string, firstUserText: string) => {
    const title = firstUserText.slice(0, 60).trim() || NEW_THREAD_TITLE;
    setThreads((prev) => prev.map((t) => (t.id === threadId && t.title === NEW_THREAD_TITLE ? { ...t, title } : t)));
    try {
      await supabase.from("copilot_threads").update({ title, last_message_at: new Date().toISOString() }).eq("id", threadId).eq("title", NEW_THREAD_TITLE);
    } catch (e) {
      console.warn("[copilot-threads] rename failed:", e);
    }
  }, []);

  const persistMessage = useCallback(async (threadId: string, msg: ChatMessage) => {
    if (threadId.startsWith("local-")) return; // skip if not server-backed
    try {
      await supabase.from("copilot_messages").upsert({
        id: msg.id,
        thread_id: threadId,
        role: msg.role,
        content: msg.content,
        ts: msg.ts,
        mentions: (msg as { mentions?: MentionEntity[] }).mentions ?? [],
        attachments: (msg as { attachments?: Attachment[] }).attachments ?? [],
      });
      await supabase.from("copilot_threads").update({ last_message_at: new Date(msg.ts).toISOString() }).eq("id", threadId);
    } catch (e) {
      console.warn("[copilot-threads] persistMessage failed:", e);
    }
  }, []);

  const deleteThread = useCallback(async (threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setActiveId((curr) => (curr === threadId ? threads.find((t) => t.id !== threadId)?.id ?? "" : curr));
    if (!threadId.startsWith("local-")) {
      try {
        await supabase.from("copilot_threads").delete().eq("id", threadId);
      } catch (e) {
        console.warn("[copilot-threads] delete failed:", e);
      }
    }
  }, [threads]);

  /**
   * Lazy-load messages for a thread. Guards against:
   * - concurrent duplicate fetches (fetchingRef)
   * - needless setThreads calls that change threads reference when nothing changed
   *   (empty→empty no-op prevents the infinite effect loop in CopilotPage)
   */
  const fetchMessagesForThread = useCallback(async (threadId: string, opts?: { force?: boolean }) => {
    if (!threadId || threadId.startsWith("local-")) return;
    const force = !!opts?.force;
    // Block concurrent fetches for the same thread (unless forced).
    if (!force && fetchingRef.current.has(threadId)) return;
    fetchingRef.current.add(threadId);
    try {
      const { data } = await supabase
        .from("copilot_messages")
        .select("id,thread_id,role,content,ts,mentions,attachments")
        .eq("thread_id", threadId)
        .order("ts", { ascending: true });
      const msgs: ChatMessage[] = (data ?? []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "note",
        content: m.content,
        ts: Number(m.ts),
        mentions: Array.isArray(m.mentions) ? (m.mentions as unknown as MentionEntity[]) : undefined,
        attachments: Array.isArray(m.attachments) ? (m.attachments as unknown as Attachment[]) : undefined,
      } as ChatMessage));
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== threadId) return t;
          // Already has messages and not forced — preserve to avoid reference churn.
          if (!force && t.messages.length > 0) return t;
          // Both old and new are empty — no-op to avoid creating a new object
          // reference that would re-trigger dependent effects.
          if (!force && t.messages.length === 0 && msgs.length === 0) return t;
          return { ...t, messages: msgs };
        }),
      );
    } catch (e) {
      console.warn("[copilot-threads] fetchMessagesForThread failed:", e);
    } finally {
      fetchingRef.current.delete(threadId);
    }
  }, []);

  const renameThread = useCallback(async (threadId: string, rawTitle: string) => {
    const title = (rawTitle || "").trim().slice(0, 80) || NEW_THREAD_TITLE;
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, title } : t)));
    if (threadId.startsWith("local-")) return;
    try {
      await supabase.from("copilot_threads").update({ title }).eq("id", threadId);
    } catch (e) {
      console.warn("[copilot-threads] rename failed:", e);
    }
  }, []);

  return {
    threads, setThreads, activeId, setActiveId, hydrated,
    newChat, deleteThread, persistMessage, renameThreadIfNew, renameThread,
    fetchMessagesForThread,
  };
}
