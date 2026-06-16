import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { parseBlocks } from "@/lib/copilotBlocks";
import { BlockRenderer } from "@/components/copilot/BlockRenderer";
import {
  Sparkles, ArrowUp, Paperclip, AtSign, Mic, ChevronDown,
  CheckCircle2, AlertTriangle, ShieldCheck, ListChecks,
  Users, Activity, Calendar, FileSearch, ArrowLeft, History,
  Plus, Share2, MoreHorizontal, Search, MessageSquare, Star, Pencil, Trash2, Check,
  Info, X, FileText, Image as ImageIcon, Headphones,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/rolesContext";
import { useCopilotPermission } from "@/lib/hooks/usePermissions";
import { logAuditEvent } from "@/lib/auditLog";
import { QUICK_PROMPTS, type CopilotMode } from "@/lib/copilotEngine";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MentionDropdown, type MentionEntity } from "@/components/copilot/MentionDropdown";
import { ScopeSelector, type CopilotScope } from "@/components/copilot/ScopeSelector";
import { ContextRail, type ActiveContext } from "@/components/copilot/ContextRail";
import { useVoiceDictation, VoiceMicButton, VoiceIndicator, VoiceConversationOverlay } from "@/components/copilot/VoiceDictation";
import * as Papa from "papaparse";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useCopilotThreads } from "@/hooks/useCopilotThreads";
import { CopilotUsageStrip, CopilotUsageMini } from "@/components/copilot/CopilotQuotaBar";
import { CopilotErrorBubble } from "@/components/copilot/CopilotErrorBubble";
import { useCopilotQuota } from "@/lib/hooks/useCopilotQuota";

const COPILOT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-ai`;

const MODES: { id: CopilotMode; label: string; hint: string }[] = [
  { id: "auto",      label: "Auto",      hint: "Pick the best mode for me" },
  { id: "ask",       label: "Ask",       hint: "Question · status check" },
  { id: "summarize", label: "Summarize", hint: "Recap a student / req / POC" },
  { id: "update",    label: "Update",    hint: "Change a status (with preview)" },
  { id: "assign",    label: "Assign",    hint: "POC or mentor allocation" },
  { id: "analyze",   label: "Analyze",   hint: "SLA, workload, bottlenecks" },
  { id: "search",    label: "Search",    hint: "Find students / mentors / regs" },
];

const QUICK_ICONS: Record<string, LucideIcon> = {
  "My today's tasks":    Calendar,
  "POC workload":        Users,
  "Process health":  Activity,
  "Student risk list":   AlertTriangle,
  "Mentor finder":       FileSearch,
  "SLA breaches":        ShieldCheck,
  "Recent updates":      ListChecks,
  "Bulk update":         CheckCircle2,
};

import type { Attachment, ChatMessage, ChatThread } from "@/hooks/useCopilotThreads";

export default function CopilotPage() {
  return (
    <ErrorBoundary fallbackTitle="Co-pilot unavailable">
      <CopilotPageInner />
    </ErrorBoundary>
  );
}

function CopilotPageInner() {
  const { user, role: realRole, viewAsRole, viewAsUser } = useRole();
  const copilotPerms = useCopilotPermission();
  const navigate = useNavigate();
  const lmpScopeId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("lmp")
    : null;
  const {
    threads, setThreads, activeId, setActiveId, hydrated,
    newChat: createThread, deleteThread, persistMessage, renameThreadIfNew,
    fetchMessagesForThread, renameThread,
  } = useCopilotThreads(lmpScopeId);

  // Track which threads have already been fetched to prevent the infinite
  // re-fetch loop caused by threads being in the dependency array.
  // Each time setThreads is called (streaming, message add), threads changes
  // reference — putting threads in deps would re-run this effect on every update.
  const loadedThreadsRef = useRef<Set<string>>(new Set());
  // Clear on scope change so the new scope's threads are re-fetched.
  useEffect(() => { loadedThreadsRef.current.clear(); }, [lmpScopeId]);

  // Lazy-load messages when switching to a thread — fires only on activeId change.
  // threads is intentionally excluded from deps; the ref guard prevents duplicates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hydrated || !activeId || activeId.startsWith("local-")) return;
    if (loadedThreadsRef.current.has(activeId)) return;
    loadedThreadsRef.current.add(activeId);
    void fetchMessagesForThread(activeId);
  }, [activeId, hydrated, fetchMessagesForThread]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<CopilotMode>("auto");
  const [scope, setScope] = useState<CopilotScope>("auto");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mentions, setMentions] = useState<MentionEntity[]>([]);
  const [activeContext, setActiveContext] = useState<ActiveContext>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionPos, setMentionPos] = useState({ top: 60, left: 16 });
  const [interimVoice, setInterimVoice] = useState("");
  const [voiceOverlay, setVoiceOverlay] = useState(false);
  const quota = useCopilotQuota();
  const queryClient = useQueryClient();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // BUG FIX 5 — reset local optimistic state when the user switches LMP scope so
  // an in-flight stream / draft / attachments from the previous LMP can't leak
  // into the new conversation. The thread list is reset by useCopilotThreads.
  useEffect(() => {
    setDraft("");
    setAttachments([]);
    setMentions([]);
    setActiveContext(null);
    setPending(false);
    setInterimVoice("");
  }, [lmpScopeId]);

  const active = threads.find((t) => t.id === activeId) ?? threads[0];
  const messages = useMemo(() => active?.messages ?? [], [active?.messages]);
  const hasChat = messages.length > 0;

  // Last assistant text for voice overlay
  const lastAssistantText = useMemo(() => {
    const last = [...messages].reverse().find(m => m.role === "assistant");
    return last?.content || "";
  }, [messages]);

  // Deep-link: ?thread=<id> from Insights / shared links.
  // Switch active thread once it has hydrated; clear param so back button stays clean.
  useEffect(() => {
    const target = searchParams.get("thread");
    if (!target || !hydrated) return;
    if (threads.some((t) => t.id === target)) {
      if (activeId !== target) setActiveId(target);
      const next = new URLSearchParams(searchParams);
      next.delete("thread");
      setSearchParams(next, { replace: true });
    } else if (threads.length > 0) {
      // Thread not visible (likely RLS or deleted) — surface a gentle toast.
      toast.error("That conversation isn't available to your account.");
      const next = new URLSearchParams(searchParams);
      next.delete("thread");
      setSearchParams(next, { replace: true });
    }
  }, [hydrated, threads, searchParams, setSearchParams, activeId, setActiveId]);

  // Voice dictation
  const voiceDictation = useVoiceDictation({
    onTranscript: (text) => setDraft(prev => prev + " " + text),
    onInterimTranscript: setInterimVoice,
  });

  const streamChat = useCallback(async (userText: string, extraMentions?: MentionEntity[], extraAttachments?: Attachment[]) => {
    const ts = Date.now();
    const msgMentions = extraMentions || mentions;
    const msgAttachments = extraAttachments || attachments;

    // ─── RBAC: Map copilot mode to permission action ───
    const modeToAction: Record<string, "summarize" | "search_lmp" | "analyze_domain" | "draft_update" | "execute_update"> = {
      summarize: "summarize",
      search: "search_lmp",
      analyze: "analyze_domain",
      update: "execute_update",
      assign: "execute_update",
      ask: "summarize",
      auto: "summarize",
    };
    const copilotAction = modeToAction[mode] || "summarize";
    const permResult = copilotPerms.check(copilotAction as any);
    if (!permResult.allowed) {
      toast.error(permResult.reason || "You don't have permission for this action.");
      return;
    }

    // Audit: log copilot usage
    logAuditEvent({
      entity_type: "system",
      action: `copilot:${mode}`,
      actor_name: user.name,
      source: "copilot",
      metadata: { mode, query_preview: userText.slice(0, 100), role: viewAsRole },
    });

    // Build enriched content with mentions and attachments context
    let enrichedContent = userText;
    if (msgMentions.length > 0) {
      const lines = msgMentions.map(m => {
        const ref = m.entityId ? ` id=${m.entityId}` : "";
        return `- @${m.name} (${m.type}${ref})${m.sub ? ` — ${m.sub}` : ""}`;
      }).join("\n");
      enrichedContent += `\n\n[Mentioned entities — already resolved via live entity search; do NOT re-resolve]:\n${lines}`;
    }
    if (msgAttachments.length > 0) {
      enrichedContent += `\n\n[Attached files:\n${msgAttachments.map(a => `--- ${a.name} ---\n${a.content.slice(0, 3000)}`).join("\n")}]`;
    }

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: userText, ts, mentions: msgMentions, attachments: msgAttachments };

    // Get conversation history for context.
    // Cap at last 20 messages (10 turns) to bound prompt size and reduce latency.
    const MAX_HISTORY = 20;
    const currentMessages = threads.find(t => t.id === activeId)?.messages ?? [];
    const history = [...currentMessages, { role: "user" as const, content: enrichedContent }]
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(-MAX_HISTORY)
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    setThreads(prev => prev.map(t =>
      t.id === activeId
        ? {
            ...t,
            title: t.messages.length === 0 ? userText.slice(0, 60) : t.title,
            messages: [...t.messages, userMsg],
          }
        : t
    ));
    // Persist user message + auto-rename thread on first message.
    void persistMessage(activeId, userMsg);
    if ((threads.find(t => t.id === activeId)?.messages.length ?? 0) === 0) {
      void renameThreadIfNew(activeId, userText);
    }
    setDraft("");
    setMentions([]);
    setAttachments([]);
    setPending(true);

    // Pre-create the assistant placeholder so error paths can replace it
    // (instead of leaving an empty bubble forever).
    const assistantId = crypto.randomUUID();
    setThreads(prev => prev.map(t =>
      t.id === activeId
        ? { ...t, messages: [...t.messages, { id: assistantId, role: "assistant" as const, content: "", ts: ts + 1, streaming: true }] }
        : t
    ));

    const replaceAssistantWith = (content: string) => {
      setThreads(prev => prev.map(t =>
        t.id === activeId
          ? { ...t, messages: t.messages.map(m => m.id === assistantId ? { ...m, content, streaming: false } : m) }
          : t
      ));
    };

    const replaceAssistantWithError = (message: string) => {
      setThreads(prev => prev.map(t =>
        t.id === activeId
          ? { ...t, messages: t.messages.map(m => m.id === assistantId
              ? ({ ...m, content: message, streaming: false, error: true, retryText: userText } as any)
              : m) }
          : t
      ));
    };

    // Hard client deadline. Structured quick prompts return directly; agentic
    // requests fail fast and can be retried instead of hanging indefinitely.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    let assistantContent = "";

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        clearTimeout(timeoutId);
        setPending(false);
        replaceAssistantWithError("⚠️ Your session has expired. Please sign in again.");
        toast.error("Your session has expired. Please sign in again.");
        return;
      }
      const resp = await fetch(COPILOT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: history,
          mode,
          scope,
          threadId: activeId && !activeId.startsWith("local-") ? activeId : null,
          mentions: msgMentions.map(m => ({ type: m.type, name: m.name, entity_id: m.entityId, email: m.email })),
          activeContext: activeContext ? {
            entity_type: activeContext.entity_type,
            entity_id: activeContext.entity_id,
            display_name: activeContext.display_name,
            sub: activeContext.sub,
            pinned: activeContext.pinned ?? false,
          } : null,
          role: viewAsRole,
          userName: user.name,
          userId: user.id,
          userEmail: user.email,
          realRole,
          viewAsUserName: viewAsUser?.name || null,
          viewAsRole,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        const raw = err.error || `Error ${resp.status}`;
        const msg = /signal timed out|took too long|timeout/i.test(raw)
          ? "The AI provider timed out before completing this request. Try again or use a quick report."
          : raw;
        toast.error(msg);
        replaceAssistantWithError(msg);
        return;
      }

      if (!resp.body) {
        toast.error("No response body");
        replaceAssistantWithError("The server returned an empty response. Please try again.");
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistantContent += delta;
              const snapshot = assistantContent;
              setThreads(prev => prev.map(t =>
                t.id === activeId
                  ? { ...t, messages: t.messages.map(m => m.id === assistantId ? { ...m, content: snapshot } : m) }
                  : t
              ));
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Empty stream fallback — never leave a blank bubble.
      if (!assistantContent.trim()) {
        replaceAssistantWithError("I received an empty response. The AI model may be overloaded — please try again in a moment.");
      } else {
        setThreads(prev => prev.map(t =>
          t.id === activeId
            ? { ...t, messages: t.messages.map(m => m.id === assistantId ? { ...m, streaming: false } : m) }
            : t
        ));
      }
    } catch (err) {
      console.error("Stream error:", err);
      const isAbort = err instanceof Error && err.name === "AbortError";
      const friendly = isAbort
        ? "Request timed out after 60 seconds. Try again or use one of the quick reports."
        : "Connection failed. Please check your internet and try again.";
      toast.error(friendly);
      // If we already streamed partial content, keep it and append a small note;
      // otherwise show the rich error bubble with Retry.
      if (assistantContent.trim()) {
        setThreads(prev => prev.map(t =>
          t.id === activeId
            ? { ...t, messages: t.messages.map(m => m.id === assistantId ? { ...m, content: assistantContent, streaming: false, error: true, retryText: userText } as any : m) }
            : t
        ));
      } else {
        replaceAssistantWithError(friendly);
      }
    } finally {
      clearTimeout(timeoutId);
      setPending(false);
      // Refresh quota counters ~3s after the turn completes to give the edge
      // function time to write the copilot_turns row.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["copilot-quota"] });
      }, 3000);
      // Persist the final assistant message (no streaming spam to DB).
      if (assistantContent.trim()) {
        void persistMessage(activeId, {
          id: assistantId,
          role: "assistant",
          content: assistantContent,
          ts: ts + 1,
        });
      }
    }
  }, [activeId, threads, mode, scope, mentions, attachments, activeContext, copilotPerms, user.id, user.name, user.email, realRole, viewAsRole, viewAsUser, setThreads, persistMessage, renameThreadIfNew, queryClient]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    // Disambiguation pick / @mention insert may carry an explicit entity id like
    // "...id=<uuid>...". Promote it into activeContext so subsequent pronouns resolve.
    const m = trimmed.match(/\b(student|poc|mentor|alumni|lmp|company|domain|status)[:= ]+([^\s)]+)[^a-z0-9]*?id=([a-z0-9-]{6,})/i);
    if (m) {
      setActiveContext(prev => (prev?.pinned ? prev : {
        entity_type: m[1].toLowerCase(),
        entity_id: m[3],
        display_name: m[2].replace(/[(),]/g, ""),
        source: "disambiguation",
      }));
    }
    streamChat(trimmed);
  };

  const newChat = () => {
    setDraft("");
    setMentions([]);
    setAttachments([]);
    setActiveContext(null);
    void createThread();
  };

  const lastMessageContent = messages[messages.length - 1]?.content;
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [messages.length, pending, activeId, lastMessageContent]);

  // @ mention detection
  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDraft(val);

    // Check for @ trigger
    const cursorPos = e.target.selectionStart;
    const textBefore = val.slice(0, cursorPos);
    const atMatch = textBefore.match(/@(\w*)$/);

    if (atMatch) {
      setShowMentions(true);
      setMentionQuery(atMatch[1]);
      // Position dropdown above textarea
      setMentionPos({ top: 60, left: 16 });
    } else {
      setShowMentions(false);
      setMentionQuery("");
    }
  };

  const handleMentionSelect = (entity: MentionEntity) => {
    // Replace @query with @Name
    const cursorPos = textareaRef.current?.selectionStart ?? draft.length;
    const textBefore = draft.slice(0, cursorPos);
    const textAfter = draft.slice(cursorPos);
    const replaced = textBefore.replace(/@\w*$/, `@${entity.name} `);
    setDraft(replaced + textAfter);
    setMentions(prev => [...prev, entity]);
    // Promote the freshly mentioned entity to activeContext (unless one is pinned).
    setActiveContext(prev => (prev?.pinned ? prev : {
      entity_type: entity.type,
      entity_id: entity.entityId || entity.name,
      display_name: entity.name,
      sub: entity.sub,
      source: "mention",
    }));
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  // File attachment handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      try {
        let content = "";
        if (file.name.endsWith(".csv")) {
          const text = await file.text();
          const result = Papa.parse(text, { header: true });
          content = JSON.stringify(result.data.slice(0, 50), null, 2);
        } else if (file.type.startsWith("text/") || file.name.endsWith(".json") || file.name.endsWith(".md")) {
          content = await file.text();
        } else if (file.type.startsWith("image/")) {
          content = `[Image file: ${file.name}, ${(file.size / 1024).toFixed(1)}KB]`;
        } else {
          content = `[File: ${file.name}, type: ${file.type}, size: ${(file.size / 1024).toFixed(1)}KB — content extraction not supported for this format]`;
        }

        setAttachments(prev => [...prev, { name: file.name, type: file.type, content }]);
        toast.success(`Attached: ${file.name}`);
      } catch {
        toast.error(`Failed to read: ${file.name}`);
      }
    }
    e.target.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const removeMention = (idx: number) => {
    setMentions(prev => prev.filter((_, i) => i !== idx));
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !showMentions) {
      e.preventDefault();
      send(draft);
    }
  };

  return (
    <div className="-mx-6 -my-8 h-[calc(100vh-56px)] flex flex-col bg-card">
      {/* Top bar */}
      <header className="h-14 shrink-0 flex items-center gap-2 px-4 border-b border-n100">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => navigate(-1)} className="h-8 w-8 grid place-items-center rounded-md text-n500 hover:text-n900 hover:bg-n100 transition-colors" aria-label="Back to LMP">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Back to LMP</TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-1.5 min-w-0">
          <span className="h-6 w-6 rounded-md bg-orange-50 border border-orange-200 grid place-items-center shrink-0">
            <Sparkles className="h-3 w-3 text-orange-500" />
          </span>
          <span className="text-[13.5px] font-semibold text-n900 shrink-0">LMP Copilot</span>
          <span className="text-n300 text-[13px] px-0.5">/</span>
          <ChatHistoryDropdown
            threads={threads}
            activeId={activeId}
            onSelect={(id) => { setActiveId(id); void fetchMessagesForThread(id, { force: true }); }}
            onNewChat={newChat}
            onRename={renameThread}
            onDelete={deleteThread}
            trigger={
              <button className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[13px] font-medium text-n800 hover:bg-n100 transition-colors min-w-0 max-w-[320px]">
                <span className="truncate">{active?.title ?? "New chat"}</span>
                <ChevronDown className="h-3.5 w-3.5 text-n400 shrink-0" />
              </button>
            }
          />
        </div>

        <div className="flex-1" />

        {/* Voice conversation mode toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => setVoiceOverlay(true)} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-n600 text-[12.5px] font-medium hover:bg-n100 transition-colors">
              <Headphones className="h-3.5 w-3.5" /> Voice
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open voice conversation mode</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={newChat} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-orange-500 text-white text-[12.5px] font-medium hover:bg-orange-600 transition-colors">
              <Plus className="h-3.5 w-3.5" /> New chat
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Start a fresh conversation</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-8 w-8 grid place-items-center rounded-md text-n500 hover:text-n900 hover:bg-n100 transition-colors" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => { void deleteThread(activeId); }} className="text-coral-600 focus:text-coral-700">Delete chat</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* (Top quota card removed — usage is shown inside the composer.) */}

      {/* Conversation area */}
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-[980px] w-full px-6 pt-8 pb-40">
          {!hasChat ? (
            <EmptyHero firstName={user.name.split(" ")[0]} onPick={p => send(p)} />
          ) : (
            <div className="space-y-6">
              {messages.map(m => {
                if (m.role === "user") return <UserBubble key={m.id} text={m.content} ts={m.ts} mentions={(m as any).mentions} attachments={(m as any).attachments} />;
                if (m.role === "note") return <InlineNote key={m.id} text={m.content} />;
                if ((m as any).error) {
                  const retryText = (m as any).retryText as string | undefined;
                  return (
                    <div key={m.id} className="space-y-2">
                      {m.content && !m.content.startsWith("⚠️") && (
                        <AssistantMarkdown content={m.content} ts={m.ts} streaming={false} onFollowUp={send} onAction={send} />
                      )}
                      <CopilotErrorBubble
                        message={m.content?.replace(/^⚠️\s*/, "") || "Something went wrong."}
                        onRetry={retryText ? () => send(retryText) : undefined}
                      />
                    </div>
                  );
                }
                return <AssistantMarkdown key={m.id} content={m.content} ts={m.ts} streaming={(m as any).streaming} onFollowUp={send} onAction={send} />;
              })}
              {pending && messages[messages.length - 1]?.role !== "assistant" && <TypingDots />}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 bg-gradient-to-t from-white via-white to-white/0 pt-6 pb-5 px-6">
        <div className="mx-auto max-w-[980px] w-full space-y-2">
          <ContextRail
            context={activeContext}
            onClear={() => setActiveContext(null)}
            onTogglePin={() => setActiveContext(c => c ? { ...c, pinned: !c.pinned } : c)}
          />
          <div className="relative rounded-[18px] border border-n200 bg-card shadow-[0_4px_20px_-8px_rgba(15,23,42,0.08)] focus-within:border-orange-300 focus-within:shadow-[0_0_0_3px_rgba(232,127,55,0.12)] transition-all">

            {/* Attachments & mentions tags */}
            {(attachments.length > 0 || mentions.length > 0) && (
              <div className="px-4 pt-2 flex flex-wrap gap-1.5">
                {attachments.map((a, i) => (
                  <span key={`a-${i}`} className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-blue-50 text-blue-600 text-[11px] font-medium">
                    <FileText className="h-3 w-3" /> {a.name}
                    <button onClick={() => removeAttachment(i)} className="hover:text-blue-800"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                {mentions.map((m, i) => (
                  <span key={`m-${i}`} className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-orange-50 text-orange-600 text-[11px] font-medium">
                    @{m.name}
                    <button onClick={() => removeMention(i)} className="hover:text-orange-800"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}

            {/* Voice indicator */}
            <VoiceIndicator listening={voiceDictation.listening} interim={interimVoice} />

            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={onKey}
              rows={2}
              placeholder="Ask about students, POCs, processes, mentors, SLA, progress, or updates…"
              className="w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[14px] text-n900 placeholder:text-n400 outline-none"
            />

            {/* Mention dropdown */}
            {showMentions && (
              <MentionDropdown
                query={mentionQuery}
                position={mentionPos}
                onSelect={handleMentionSelect}
                onClose={() => setShowMentions(false)}
              />
            )}

            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <div className="flex items-center gap-0.5">
                {/* File upload */}
                <input ref={fileInputRef} type="file" multiple accept=".csv,.pdf,.xlsx,.xls,.doc,.docx,.txt,.json,.md,.png,.jpg,.jpeg" onChange={handleFileUpload} className="hidden" />
                <button type="button" title="Attach file" aria-label="Attach file" onClick={() => fileInputRef.current?.click()}
                  className={cn("h-8 w-8 grid place-items-center rounded-md transition-colors",
                    attachments.length > 0 ? "text-blue-500 bg-blue-50" : "text-n500 hover:text-n800 hover:bg-n100"
                  )}
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                {/* @ Mention trigger */}
                <button type="button" title="Mention entity" aria-label="Mention" onClick={() => {
                  setDraft(prev => prev + "@");
                  setShowMentions(true);
                  setMentionQuery("");
                  textareaRef.current?.focus();
                }}
                  className={cn("h-8 w-8 grid place-items-center rounded-md transition-colors",
                    mentions.length > 0 ? "text-orange-500 bg-orange-50" : "text-n500 hover:text-n800 hover:bg-n100"
                  )}
                >
                  <AtSign className="h-4 w-4" />
                </button>

                {/* Voice dictation */}
                <VoiceMicButton listening={voiceDictation.listening} supported={voiceDictation.supported} onToggle={voiceDictation.toggle} />

                <ModePicker mode={mode} onChange={setMode} />
                <ScopeSelector scope={scope} onChange={setScope} />
              </div>
              <div className="flex items-center gap-2">
                <CopilotUsageStrip active={pending} />
                <CopilotUsageMini active={pending} />
                <button
                  onClick={() => send(draft)}
                  disabled={!draft.trim() || pending || quota.isAtLimit}
                  title={quota.isAtLimit ? `Daily limit reached. Resets at ${quota.resetLocal}.` : undefined}
                  className={cn(
                    "h-8 w-8 rounded-lg grid place-items-center transition-colors",
                    draft.trim() && !pending && !quota.isAtLimit ? "bg-orange-500 text-white hover:bg-orange-600" : "bg-n100 text-n400 cursor-not-allowed",
                  )}
                  aria-label="Send"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          {quota.isAtLimit && (
            <p className="text-center mt-2 text-[11px] text-rose-500">Daily limit reached. Resets at {quota.resetLocal}.</p>
          )}
          <p className="text-center mt-2 text-[11px] text-n400">LMP Copilot answers are based on your LMP data. Always verify important information.</p>
        </div>
      </div>

      {/* Voice Conversation Overlay — runs its own conversation loop */}
      <VoiceConversationOverlay
        open={voiceOverlay}
        onClose={() => setVoiceOverlay(false)}
        userName={user.name}
        role={viewAsRole}
        userId={user.id}
        userEmail={user.email}
        viewAsUserName={viewAsUser?.name || null}
        viewAsRole={viewAsRole}
        threadId={activeId}
        onPersistMessage={persistMessage}
      />
    </div>
  );
}

/* ── Sub-components ── */

function EmptyHero({ firstName, onPick }: { firstName: string; onPick: (p: string) => void }) {
  return (
    <div className="pt-12">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-orange-50 border border-orange-200 grid place-items-center">
          <Sparkles className="h-5 w-5 text-orange-500" />
        </div>
        <h3 className="mt-4 text-[24px] font-bold tracking-[-0.3px] text-n900">
          Hey {firstName} — what's our LMP quest today?
        </h3>
        <p className="mt-1.5 text-[13px] text-n500">
          Ask in plain English. I'll search the LMP Tracker &amp; Mastersheet and give you data-backed answers.
        </p>
      </div>

      <div className="mt-8">
        <div className="text-[11px] uppercase tracking-[0.5px] text-n500 font-medium mb-2.5 px-1">Quick prompts</div>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-2.5">
          {QUICK_PROMPTS.map(q => {
            const Icon = QUICK_ICONS[q.title] ?? Sparkles;
            return (
              <button key={q.title} onClick={() => onPick(q.prompt)} className="group text-left rounded-xl bg-card border border-n200 p-3 hover:border-orange-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-lg bg-n100 text-n600 grid place-items-center group-hover:bg-orange-50 group-hover:text-orange-500 transition-colors">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="text-[13px] font-semibold text-n900 truncate">{q.title}</div>
                </div>
                <div className="mt-1.5 text-[11.5px] text-n500 line-clamp-2">{q.sub}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChatHistoryDropdown({ threads, activeId, onSelect, onNewChat, onRename, onDelete, trigger }: {
  threads: ChatThread[]; activeId: string; onSelect: (id: string) => void; onNewChat: () => void;
  onRename: (id: string, title: string) => void; onDelete: (id: string) => void;
  trigger: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const filtered = useMemo(() => threads.filter(t => t.title.toLowerCase().includes(query.toLowerCase())), [threads, query]);
  const groups = useMemo(() => {
    const out: Record<string, ChatThread[]> = {};
    filtered.forEach(t => { out[t.group] = out[t.group] ?? []; out[t.group].push(t); });
    return out;
  }, [filtered]);

  const commitRename = (id: string) => {
    const next = editValue.trim();
    const original = threads.find(t => t.id === id)?.title ?? "";
    if (next && next !== original) onRename(id, next);
    setEditingId(null);
    setEditValue("");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[360px] p-0">
        <div className="p-2 border-b border-n100">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-n400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search chats" className="w-full h-8 rounded-md bg-n50 border border-transparent pl-8 pr-2 text-[12.5px] text-n800 placeholder:text-n400 outline-none focus:border-n200" />
          </div>
        </div>
        <button onClick={onNewChat} className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] font-medium text-orange-600 hover:bg-orange-50 transition-colors">
          <Plus className="h-3.5 w-3.5" /> New chat
        </button>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-[360px] overflow-y-auto py-1">
          {Object.keys(groups).length === 0 && <div className="px-3 py-6 text-center text-[12px] text-n400">No chats found</div>}
          {(["Today", "Yesterday", "Earlier"] as const).map(g =>
            groups[g] ? (
              <div key={g} className="py-1">
                <div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-[0.5px] text-n400 font-medium">{g}</div>
                {groups[g].map(t => {
                  const isEditing = editingId === t.id;
                  const isConfirming = confirmId === t.id;
                  const isActive = t.id === activeId;
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "group flex items-center gap-2 mx-1 px-2 py-1.5 rounded-md",
                        !isEditing && !isConfirming && "cursor-pointer",
                        isActive ? "bg-orange-50 text-orange-700" : "hover:bg-n100 text-n800",
                      )}
                      onClick={() => { if (!isEditing && !isConfirming) onSelect(t.id); }}
                    >
                      <MessageSquare className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-orange-500" : "text-n400")} />
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onBlur={() => commitRename(t.id)}
                          onKeyDown={e => {
                            if (e.key === "Enter") { e.preventDefault(); commitRename(t.id); }
                            else if (e.key === "Escape") { e.preventDefault(); setEditingId(null); setEditValue(""); }
                          }}
                          className="flex-1 min-w-0 h-6 px-1.5 rounded border border-orange-300 bg-card text-[12.5px] text-n900 outline-none"
                        />
                      ) : isConfirming ? (
                        <span className="flex-1 truncate text-[12px] text-n600">Delete this chat?</span>
                      ) : (
                        <span className="flex-1 truncate text-[12.5px]">{t.title}</span>
                      )}

                      {isConfirming ? (
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="h-6 px-2 rounded text-[11px] font-medium text-n600 hover:bg-n200"
                          >Cancel</button>
                          <button
                            onClick={() => { onDelete(t.id); setConfirmId(null); }}
                            className="h-6 px-2 rounded text-[11px] font-medium bg-coral-500 text-white hover:bg-coral-600"
                          >Delete</button>
                        </div>
                      ) : isEditing ? (
                        <button
                          onClick={e => { e.stopPropagation(); commitRename(t.id); }}
                          aria-label="Save name"
                          className="h-6 w-6 grid place-items-center rounded text-orange-600 hover:bg-orange-100 shrink-0"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => { e.stopPropagation(); setEditingId(t.id); setEditValue(t.title); }}
                            aria-label="Rename chat"
                            className="h-6 w-6 grid place-items-center rounded text-n500 hover:text-n900 hover:bg-n200"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmId(t.id); }}
                            aria-label="Delete chat"
                            className="h-6 w-6 grid place-items-center rounded text-n500 hover:text-coral-600 hover:bg-coral-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModePicker({ mode, onChange }: { mode: CopilotMode; onChange: (m: CopilotMode) => void }) {
  const active = MODES.find(m => m.id === mode)!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[12px] font-medium text-n700 hover:bg-n100">
          <Sparkles className="h-3 w-3 text-orange-500" /> {active.label} <ChevronDown className="h-3 w-3 text-n400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {MODES.map(m => (
          <DropdownMenuItem key={m.id} onClick={() => onChange(m.id)}>
            <div className="flex flex-col">
              <span className={cn("text-[12.5px]", m.id === mode ? "font-semibold text-n900" : "text-n800")}>{m.label}</span>
              <span className="text-[10.5px] text-n500">{m.hint}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function UserBubble({ text, ts, mentions, attachments }: { text: string; ts: number; mentions?: MentionEntity[]; attachments?: Attachment[] }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%]">
        {/* Attachment chips */}
        {attachments && attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
            {attachments.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 h-5 px-2 rounded-md bg-blue-100 text-blue-700 text-[10px] font-medium">
                <FileText className="h-2.5 w-2.5" /> {a.name}
              </span>
            ))}
          </div>
        )}
        <div className="rounded-2xl rounded-tr-md bg-n100 px-3.5 py-2.5">
          <div className="text-[13.5px] text-n900 whitespace-pre-wrap leading-[1.5]">{text}</div>
        </div>
        {/* Mention tags */}
        {mentions && mentions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 justify-end">
            {mentions.map((m, i) => (
              <span key={i} className="text-[10px] text-orange-500 font-medium">@{m.name}</span>
            ))}
          </div>
        )}
        <div className="mt-1 text-[10.5px] text-n400 text-right pr-1">{fmtTime(ts)}</div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-start gap-3">
      <span className="h-7 w-7 rounded-full bg-orange-50 border border-orange-200 grid place-items-center shrink-0 mt-0.5">
        <Sparkles className="h-3.5 w-3.5 text-orange-500 animate-pulse" />
      </span>
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center gap-1.5 text-n600 text-[12.5px] font-medium">
          <Activity className="h-3.5 w-3.5 text-orange-500 animate-pulse" />
          <span>Searching data & executing tools…</span>
        </div>
        <div className="flex gap-0.5 pl-5">
          {[0, 1, 2].map(i => (
            <span key={i} className="h-1 w-1 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Section heading icons & accent colors ── */
const SECTION_META: Record<string, { icon: LucideIcon; accent: string; bg: string; border: string }> = {
  summary:          { icon: FileSearch,    accent: "text-blue-600",   bg: "bg-blue-50",    border: "border-blue-200" },
  "key insights":   { icon: Star,          accent: "text-amber-600",  bg: "bg-amber-50",   border: "border-amber-200" },
  insights:         { icon: Star,          accent: "text-amber-600",  bg: "bg-amber-50",   border: "border-amber-200" },
  recommendations:  { icon: CheckCircle2,  accent: "text-emerald-600",bg: "bg-emerald-50", border: "border-emerald-200" },
  details:          { icon: ListChecks,    accent: "text-violet-600", bg: "bg-violet-50",  border: "border-violet-200" },
  "action taken":   { icon: Activity,      accent: "text-orange-600", bg: "bg-orange-50",  border: "border-orange-200" },
  "follow-up":      { icon: MessageSquare, accent: "text-sky-600",    bg: "bg-sky-50",     border: "border-sky-200" },
  workload:         { icon: Users,         accent: "text-indigo-600", bg: "bg-indigo-50",  border: "border-indigo-200" },
  analytics:        { icon: Activity,      accent: "text-rose-600",   bg: "bg-rose-50",    border: "border-rose-200" },
};

function lookupSection(text: string) {
  const lower = text.toLowerCase().replace(/[^a-z\s-]/g, "").trim();
  for (const key of Object.keys(SECTION_META)) {
    if (lower.includes(key)) return SECTION_META[key];
  }
  return null;
}

function splitSections(md: string): { intro: string; sections: { heading: string; body: string }[] } {
  const parts = md.split(/^(#{2,3}\s+.+)$/gm);
  let intro = "";
  const sections: { heading: string; body: string }[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^#{2,3}\s+/.test(part)) {
      const heading = part.replace(/^#{2,3}\s+/, "").trim();
      const body = (parts[i + 1] || "").trim();
      sections.push({ heading, body });
      i++;
    } else if (sections.length === 0) {
      intro += part;
    }
  }

  return { intro: intro.trim(), sections };
}

const PROSE_BASE = "prose prose-sm max-w-none text-[13.5px] text-n800 leading-[1.65] prose-headings:text-n900 prose-headings:text-[14px] prose-headings:font-semibold prose-strong:text-n900 prose-a:text-orange-600 prose-code:bg-n100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px] prose-pre:bg-n50 prose-pre:border prose-pre:border-n200 prose-table:text-[12.5px] prose-th:bg-n50 prose-th:px-2.5 prose-th:py-1.5 prose-td:px-2.5 prose-td:py-1.5 prose-td:border-t prose-td:border-n100";

function AssistantMarkdown({ content, ts, streaming, onFollowUp, onAction }: { content: string; ts: number; streaming?: boolean; onFollowUp?: (text: string) => void; onAction?: (cmd: string) => void }) {
  const text = content || (streaming ? "Searching data…" : "");
  const { blocks, plainText, fenceDetected } = useMemo(() => parseBlocks(text), [text]);
  const hasBlocks = blocks.length > 0;
  const showSkeleton = fenceDetected && !hasBlocks && streaming;

  const { intro, sections } = useMemo(() => (hasBlocks ? { intro: "", sections: [] } : splitSections(plainText || text)), [hasBlocks, plainText, text]);
  const hasSections = sections.length > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex gap-3">
      <span className="h-7 w-7 rounded-full bg-orange-50 border border-orange-200 grid place-items-center shrink-0 mt-0.5">
        <Sparkles className="h-3.5 w-3.5 text-orange-500" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[12.5px] font-semibold text-n900">LMP Copilot</span>
          <span className="text-[10.5px] text-n400">{fmtTime(ts)}</span>
          {streaming && <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />}
        </div>

        {showSkeleton && (
          <div className="rounded-2xl border border-n200 bg-gradient-to-br from-n50 to-white p-4 flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-[12.5px] text-n500">Preparing answer…</span>
          </div>
        )}

        {hasBlocks && (
          <div className="flex flex-col gap-4">
            {blocks.map((block, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: idx * 0.06 }}>
                <BlockRenderer block={block} onFollowUp={onFollowUp} onAction={onAction} />
              </motion.div>
            ))}
          </div>
        )}

        {hasBlocks && plainText && (
          <div className={cn(PROSE_BASE, "mt-3")}>
            <ReactMarkdown>{plainText}</ReactMarkdown>
          </div>
        )}

        {!hasBlocks && intro && (
          <div className={cn(PROSE_BASE, hasSections && "mb-3")}>
            <ReactMarkdown>{intro}</ReactMarkdown>
          </div>
        )}

        {!hasBlocks && hasSections && (
          <div className="flex flex-col gap-2.5">
            {sections.map((sec, idx) => {
              const meta = lookupSection(sec.heading);
              const Icon = meta?.icon || Info;
              const accent = meta?.accent || "text-n700";
              const bg = meta?.bg || "bg-n50";
              const border = meta?.border || "border-n200";
              return (
                <motion.div key={idx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, delay: idx * 0.04 }}
                  className={cn("rounded-lg border px-3.5 py-2.5", border, bg)}
                >
                  <div className={cn("flex items-center gap-1.5 mb-1.5 text-[12.5px] font-semibold", accent)}>
                    <Icon className="h-3.5 w-3.5" />
                    {sec.heading}
                  </div>
                  <div className={cn(PROSE_BASE, "prose-headings:hidden")}>
                    <ReactMarkdown>{sec.body}</ReactMarkdown>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {!hasBlocks && !intro && !hasSections && (
          <div className={PROSE_BASE}>
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function InlineNote({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-n500 pl-10">
      <Info className="h-3.5 w-3.5 text-n400" />
      <span>{text}</span>
    </div>
  );
}
