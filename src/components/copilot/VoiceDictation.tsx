import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Radio, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

// ─── Types ──────────────────────────────────────────────────────────────────

export type VoiceStatus =
  | "idle"
  | "requesting"
  | "listening"
  | "thinking"
  | "error"
  | "unsupported";

interface VoiceDictationProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
}

// ─── Speech Synthesis utilities ─────────────────────────────────────────────

function stripMarkdown(input: string): string {
  return input
    .replace(/:::blocks[\s\S]*?:::/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/>\s?/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
}

export function speakResponse(text: string, opts?: { rate?: number; lang?: string }) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const clean = stripMarkdown(text || "").slice(0, 500);
  if (!clean) return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = opts?.rate ?? 1.05;
  u.lang = opts?.lang ?? "en-US";
  try { window.speechSynthesis.speak(u); } catch { /* noop */ }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

// How long of true silence before we consider the user "done" speaking.
const SILENCE_END_MS = 1500;
// Minimum characters to accept as a real utterance (filters cough/click noise).
const MIN_UTTERANCE_CHARS = 2;

export function useVoiceDictation({ onTranscript, onInterimTranscript }: VoiceDictationProps) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<any>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onInterimRef = useRef(onInterimTranscript);

  // Accumulators for continuous recognition — flushed on silence.
  const accumulatedFinalRef = useRef<string>("");
  const lastInterimRef = useRef<string>("");
  const silenceTimerRef = useRef<number | null>(null);
  const wantListeningRef = useRef<boolean>(false);
  const flushingRef = useRef<boolean>(false);

  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { onInterimRef.current = onInterimTranscript; }, [onInterimTranscript]);

  useEffect(() => {
    const SpeechRecognition =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;
    if (!SpeechRecognition) {
      setStatus("unsupported");
      return;
    }
    const recognition = new SpeechRecognition();
    // Continuous lets the user pause mid-sentence without us cutting them off.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    // Indian English markedly improves recognition for "POC" / "LMP" / Indian names.
    // If the browser locale is en-* (other than en-IN) keep en-IN anyway — it
    // performs best for the target users.
    const nav = typeof navigator !== "undefined" ? navigator.language : "en-IN";
    recognition.lang = nav?.startsWith("en-") ? nav : "en-IN";

    const clearSilenceTimer = () => {
      if (silenceTimerRef.current !== null) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };

    const flush = () => {
      if (flushingRef.current) return;
      const combined = (accumulatedFinalRef.current + " " + lastInterimRef.current).trim();
      accumulatedFinalRef.current = "";
      lastInterimRef.current = "";
      clearSilenceTimer();
      if (combined.length < MIN_UTTERANCE_CHARS) {
        setInterim("");
        return;
      }
      flushingRef.current = true;
      // Pause recognition while the assistant processes and speaks. The voice
      // overlay restarts it after the reply, producing listen -> reply -> listen
      // turn-taking instead of Chrome immediately reopening the microphone.
      wantListeningRef.current = false;
      setStatus("thinking");
      setInterim("");
      try { recognition.stop(); } catch { /* noop */ }
      try { onTranscriptRef.current(combined); } finally { flushingRef.current = false; }
    };

    const armSilenceTimer = () => {
      clearSilenceTimer();
      silenceTimerRef.current = window.setTimeout(flush, SILENCE_END_MS);
    };

    recognition.onstart = () => {
      setStatus("listening");
      setErrorMsg("");
    };

    recognition.onresult = (event: any) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // Pick the highest-confidence alternative.
        let best = result[0];
        for (let k = 1; k < result.length; k++) {
          if ((result[k].confidence ?? 0) > (best.confidence ?? 0)) best = result[k];
        }
        const t = best.transcript;
        if (result.isFinal) accumulatedFinalRef.current += (accumulatedFinalRef.current ? " " : "") + t.trim();
        else interimText += t;
      }
      lastInterimRef.current = interimText;
      if (interimText) {
        setInterim(interimText);
        onInterimRef.current?.(interimText);
      }
      // Reset the silence countdown on every result (final or interim).
      armSilenceTimer();
    };

    recognition.onerror = (event: any) => {
      const err: string = event?.error || "unknown";
      if (err === "no-speech") {
        // Don't surface — just keep listening if we still want to.
        return;
      }
      if (err === "aborted") {
        clearSilenceTimer();
        setStatus("idle");
        setInterim("");
        return;
      }
      const friendly =
        err === "not-allowed" || err === "service-not-allowed"
          ? "Microphone permission denied"
          : err === "audio-capture"
          ? "No microphone detected"
          : err === "network"
          ? "Network error during voice input"
          : `Voice error: ${err}`;
      setErrorMsg(friendly);
      setStatus("error");
      setInterim("");
      wantListeningRef.current = false;
      clearSilenceTimer();
      window.setTimeout(() => {
        setStatus(s => (s === "error" ? "idle" : s));
      }, 2500);
    };

    recognition.onend = () => {
      setInterim("");
      // If the user is still in a speaking burst (we have pending text), flush it.
      const pending = (accumulatedFinalRef.current + " " + lastInterimRef.current).trim();
      if (pending.length >= MIN_UTTERANCE_CHARS && !flushingRef.current) {
        flush();
        return;
      }
      // Auto-restart when the browser auto-stops (Chrome stops after ~60s of silence).
      if (wantListeningRef.current && !flushingRef.current) {
        try { recognition.start(); return; } catch { /* fall through */ }
      }
      setStatus(s => (s === "error" || s === "unsupported" ? s : "idle"));
    };

    recognitionRef.current = recognition;

    return () => {
      wantListeningRef.current = false;
      clearSilenceTimer();
      try { recognition.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    setErrorMsg("");
    setStatus("requesting");
    accumulatedFinalRef.current = "";
    lastInterimRef.current = "";
    wantListeningRef.current = true;
    flushingRef.current = false;
    try {
      rec.start();
    } catch {
      try { rec.abort(); } catch { /* noop */ }
      window.setTimeout(() => {
        try { rec.start(); } catch { setStatus("idle"); }
      }, 150);
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    wantListeningRef.current = false;
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    try { rec.stop(); } catch { /* noop */ }
  }, []);

  const toggle = useCallback(() => {
    if (status === "unsupported") return;
    if (status === "listening" || status === "requesting") stop();
    else start();
  }, [status, start, stop]);

  const listening = status === "listening" || status === "requesting";
  const supported = status !== "unsupported";

  return { status, errorMsg, interim, listening, supported, start, stop, toggle };
}

// ─── Mic Button ─────────────────────────────────────────────────────────────

export function VoiceMicButton({
  listening, supported, onToggle, status, disabled,
}: {
  listening: boolean;
  supported: boolean;
  onToggle: () => void;
  status?: VoiceStatus;
  disabled?: boolean;
}) {
  const effectiveStatus: VoiceStatus = status
    ?? (!supported ? "unsupported" : listening ? "listening" : "idle");

  if (effectiveStatus === "unsupported") {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled
              aria-label="Voice not supported"
              className="h-8 w-8 grid place-items-center rounded-md text-n300 cursor-not-allowed"
            >
              <MicOff className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[260px] text-xs leading-snug">
            Voice input isn't available in this browser. For dictation, open the app in <strong>Chrome</strong>, <strong>Edge</strong>, or <strong>Safari</strong> on desktop or Android. You can still type your prompt below — all copilot features work without voice.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const isBusy = effectiveStatus === "listening" || effectiveStatus === "requesting";
  const label =
    effectiveStatus === "requesting" ? "Requesting microphone…" :
    effectiveStatus === "listening" ? "Stop listening" :
    effectiveStatus === "thinking" ? "Processing…" :
    effectiveStatus === "error" ? "Voice error" :
    "Start dictation";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggle}
            type="button"
            disabled={disabled || effectiveStatus === "thinking"}
            aria-label={label}
            className={cn(
              "relative h-8 w-8 grid place-items-center rounded-md transition-colors",
              isBusy
                ? "bg-red-50 text-red-500 hover:bg-red-100"
                : effectiveStatus === "error"
                ? "bg-coral-50 text-coral-600"
                : effectiveStatus === "thinking"
                ? "bg-n100 text-n500"
                : "text-n500 hover:text-n800 hover:bg-n100",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {/* Animated ping ring while listening */}
            {effectiveStatus === "listening" && (
              <>
                <span className="absolute inset-0 rounded-md bg-red-400/40 animate-ping" aria-hidden />
                <span className="absolute inset-0 rounded-md ring-2 ring-red-400/70" aria-hidden />
              </>
            )}
            <span className="relative">
              {effectiveStatus === "requesting" || effectiveStatus === "thinking" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : effectiveStatus === "error" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : effectiveStatus === "listening" ? (
                <Radio className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Live Indicator (under input) ───────────────────────────────────────────

export function VoiceIndicator({
  listening, interim, status, errorMsg,
}: {
  listening: boolean;
  interim: string;
  status?: VoiceStatus;
  errorMsg?: string;
}) {
  const visible =
    listening ||
    status === "requesting" ||
    status === "thinking" ||
    (status === "error" && !!errorMsg);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="px-4 pb-1 overflow-hidden"
        >
          <div className="flex items-center gap-2">
            {status === "error" ? (
              <>
                <AlertTriangle className="h-3 w-3 text-coral-500" />
                <span className="text-[11px] text-coral-600 font-medium">{errorMsg}</span>
              </>
            ) : status === "thinking" ? (
              <>
                <Loader2 className="h-3 w-3 text-n500 animate-spin" />
                <span className="text-[11px] text-n600 font-medium">Processing…</span>
              </>
            ) : status === "requesting" ? (
              <>
                <Loader2 className="h-3 w-3 text-orange-500 animate-spin" />
                <span className="text-[11px] text-orange-600 font-medium">Waiting for mic permission…</span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  {[0, 1, 2, 3, 4].map(i => (
                    <motion.span
                      key={i}
                      animate={{ scaleY: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
                      className="w-0.5 h-3 bg-red-400 rounded-full origin-center"
                    />
                  ))}
                </div>
                <span className="text-[11px] text-red-500 font-medium">Listening…</span>
                {interim && (
                  <span className="text-[11px] text-n500 italic truncate flex-1">{interim}</span>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Floating interim bubble (anchored above mic button) ────────────────────

export function VoiceInterimBubble({ interim, listening }: { interim: string; listening: boolean }) {
  return (
    <AnimatePresence>
      {listening && interim && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          className="absolute bottom-full mb-2 right-0 max-w-[280px] rounded-lg border border-n200 bg-card shadow-lg px-3 py-1.5 text-[11.5px] text-n700 italic"
        >
          {interim}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Conversational Voice Overlay (full-screen mic + TTS) ─────────────────

import { speak as speakTts, stopSpeaking as stopTts } from "@/lib/voice/speakTts";
import { sanitizePendingActionSummary } from "@/lib/copilot/confirmationLabels";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const VOICE_COPILOT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-copilot`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token
      ? { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }
      : { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` }),
  };
}

interface VoiceMessage { role: "user" | "assistant"; content: string; blocks?: any[]; }
interface VoicePendingRef { pending_action_id: string; }

interface VoiceConversationOverlayProps {
  open: boolean;
  onClose: () => void;
  onSend?: (text: string) => void;
  lastAssistantText?: string;
  pending?: boolean;
  userName?: string;
  role?: string;
  userId?: string;
  userEmail?: string;
  viewAsUserName?: string | null;
  viewAsRole?: string | null;
  threadId?: string | null;
  onPersistMessage?: (threadId: string, msg: any) => Promise<void> | void;
}

function renderVoiceBlocks(blocks: any[]) {
  const notable = blocks.filter(b =>
    b.type === "count" ||
    (b.type === "lmp_list" && (b.rows as any[])?.length) ||
    (b.type === "analytics" && b.data?.distribution) ||
    b.type === "pending_action"
  );
  if (!notable.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-black/10 pt-1.5 text-[11px]">
      {notable.map((b, i) => {
        if (b.type === "count") return (
          <span key={i} className="text-n600">
            <strong>{b.count}</strong> {b.entity}(s)
            {(b.sample as string[])?.length > 0 && (
              <span className="text-n400"> — {(b.sample as string[]).slice(0, 3).join(", ")}</span>
            )}
          </span>
        );
        if (b.type === "lmp_list") return (
          <div key={i} className="text-n600 space-y-0.5">
            {(b.rows as any[]).slice(0, 5).map((r: any, j: number) => (
              <div key={j} className="flex gap-1 justify-between">
                <span className="truncate">{r.company} – {r.role}</span>
                <span className="text-n400 shrink-0">{r.status}</span>
              </div>
            ))}
            {b.total > 5 && <span className="text-n400">+{b.total - 5} more</span>}
          </div>
        );
        if (b.type === "analytics" && b.data?.distribution) return (
          <div key={i} className="text-n600 space-y-0.5">
            {Object.entries(b.data.distribution as Record<string, number>).slice(0, 6).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span>{k}</span><strong>{v}</strong>
              </div>
            ))}
          </div>
        );
        if (b.type === "pending_action") return (
          <div key={i} className="bg-orange-50 border border-orange-200 rounded-lg px-2 py-1 text-orange-800">
            {sanitizePendingActionSummary(b.summary)}
          </div>
        );
        return null;
      })}
    </div>
  );
}

const AFFIRM = /\b(yes|yep|yeah|sure|do it|go ahead|confirm|ok|okay|please do|haan|haa|theek hai|kar do|of course|absolutely)\b/i;
const NEGATE = /\b(no|nope|cancel|stop|don't|do not|never mind|nevermind|nahi|nahin|abort|skip)\b/i;

export function VoiceConversationOverlay({
  open, onClose, userName, role, userId, userEmail, viewAsUserName, viewAsRole,
  threadId, onPersistMessage,
}: VoiceConversationOverlayProps) {
  const [transcript, setTranscript] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [lastSpoken, setLastSpoken] = useState("");
  const [muted, setMuted] = useState(false);
  // alwaysListen: when true, mic restarts automatically after each turn
  const [alwaysListen, setAlwaysListen] = useState(true);
  const [visibleMessages, setVisibleMessages] = useState<VoiceMessage[]>([]);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<VoiceMessage[]>([]);
  const handlingRef = useRef(false);
  const autoListenRef = useRef(true);
  const pendingActionRef = useRef<VoicePendingRef | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep ref in sync with state so async callbacks see the latest value
  useEffect(() => { autoListenRef.current = alwaysListen; }, [alwaysListen]);

  const stripForVoice = useCallback((s: string) => stripMarkdown(s).slice(0, 600), []);

  const speak = useCallback(async (text: string) => {
    setLastSpoken(text);
    if (muted) return;
    try {
      await speakTts(text, {
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
      });
    } catch (err) {
      console.error("TTS error", err);
      setSpeaking(false);
    }
  }, [muted]);

  const identityPayload = useMemo(() => ({
    userName: userName || "User",
    role: role || "admin",
    userId: userId || null,
    userEmail: userEmail || null,
    viewAsUserName: viewAsUserName || null,
    viewAsRole: viewAsRole || null,
  }), [userName, role, userId, userEmail, viewAsUserName, viewAsRole]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages]);

  const callVoiceCopilot = useCallback(async (userText: string) => {
    // Cancel any in-flight request (barge-in)
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, 60_000);

    const handleAbort = async () => {
      setThinking(false);
      if (timedOut) {
        const spoken = "That took too long to process. Please try a shorter request.";
        messagesRef.current.push({ role: "assistant", content: spoken });
        setVisibleMessages(prev => [...prev, { role: "assistant", content: spoken }]);
        await speak(spoken);
      }
    };

    // Confirmation branch: if we have a pending action and user agrees, execute it
    const pending = pendingActionRef.current;
    if (pending) {
      if (AFFIRM.test(userText) && !NEGATE.test(userText)) {
        setThinking(true);
        try {
          const resp = await fetch(VOICE_COPILOT_URL, {
            method: "POST",
            signal: ctrl.signal,
            headers: await authHeaders(),
            body: JSON.stringify({
              messages: [],
              confirm: { pending_action_id: pending.pending_action_id },
              ...identityPayload,
            }),
          });
          let data: any = {};
          try { data = await resp.json(); } catch { /* non-json */ }
          if (!resp.ok) {
            const spoken = stripForVoice(
              data?.spoken || "Couldn't complete that action. Please try again.",
            );
            messagesRef.current.push({ role: "assistant", content: spoken });
            setVisibleMessages(prev => [...prev, { role: "assistant", content: spoken }]);
            setThinking(false);
            await speak(spoken);
            window.clearTimeout(timeout);
            return;
          }
          pendingActionRef.current = null;
          const spoken = stripForVoice(data.spoken || "Done.");
          messagesRef.current.push({ role: "assistant", content: spoken });
          setVisibleMessages(prev => [...prev, { role: "assistant", content: spoken }]);
          if (threadId && onPersistMessage) {
            void onPersistMessage(threadId, {
              id: crypto.randomUUID(),
              role: "assistant" as const,
              content: `🎤 ${spoken}`,
              ts: Date.now(),
            });
          }
          setThinking(false);
          await speak(spoken);
        } catch (err) {
          if ((err as any)?.name === "AbortError") {
            await handleAbort();
          } else {
            console.error(err);
            setThinking(false);
          }
        }
        window.clearTimeout(timeout);
        return;
      }
      if (NEGATE.test(userText)) {
        pendingActionRef.current = null;
        const spoken = "Cancelled.";
        messagesRef.current.push({ role: "assistant", content: spoken });
        setVisibleMessages(prev => [...prev, { role: "assistant", content: spoken }]);
        await speak(spoken);
        window.clearTimeout(timeout);
        return;
      }
      // Ambiguous reply while pending — keep the staged action, ask again.
      const clarify = "I still have a pending change. Say yes to confirm or no to cancel.";
      messagesRef.current.push({ role: "assistant", content: clarify });
      setVisibleMessages(prev => [...prev, { role: "assistant", content: clarify }]);
      await speak(clarify);
      window.clearTimeout(timeout);
      return;
    }

    const userMsgTs = Date.now();
    messagesRef.current = [...messagesRef.current, { role: "user", content: userText }];
    setVisibleMessages(prev => [...prev, { role: "user", content: userText }]);
    // Persist user turn to the shared thread (no-op if threadId is local-)
    if (threadId && onPersistMessage) {
      void onPersistMessage(threadId, {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: userText,
        ts: userMsgTs,
      });
    }
    setThinking(true);
    const fetchPayload = {
      messages: messagesRef.current.slice(-8),
      ...identityPayload,
    };
    const fetchHeaders = await authHeaders();
    let attempt = 0;
    const voiceFetch = () => fetch(VOICE_COPILOT_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: fetchHeaders,
      body: JSON.stringify(fetchPayload),
    });
    try {
      let resp: Response;
      while (true) {
        try {
          resp = await voiceFetch();
          break;
        } catch (fetchErr) {
          if ((fetchErr as { name?: string })?.name === "AbortError") throw fetchErr;
          if (attempt >= 1) throw fetchErr;
          attempt += 1;
          await new Promise((r) => setTimeout(r, 800));
        }
      }

      let data: any = {};
      try { data = await resp.json(); } catch { /* non-json body */ }

      // Map structured backend error codes to friendly spoken messages
      let spoken: string;
      if (!resp.ok || data?.error) {
        const code = data?.code ?? "";
        if (resp.status === 429 || code === "AI_DAILY_BUDGET_EXHAUSTED") {
          spoken = "Your daily AI budget is used up. It resets at midnight.";
        } else if (resp.status === 503 || code === "ALL_AI_PROVIDERS_UNAVAILABLE") {
          spoken = "AI services are temporarily unavailable. Please try again in a moment.";
        } else if (resp.status === 401 || resp.status === 403) {
          spoken = "I couldn't verify your identity. Please sign in again.";
        } else if (typeof data?.spoken === "string" && data.spoken) {
          spoken = stripForVoice(data.spoken);
        } else {
          spoken = "I had trouble reaching the assistant. Please try again.";
        }
      } else {
        spoken = stripForVoice(data.spoken || "Sorry, I didn't catch that.");
      }

      if (data.pendingAction?.pending_action_id) {
        pendingActionRef.current = { pending_action_id: data.pendingAction.pending_action_id };
      }
      messagesRef.current.push({ role: "assistant", content: spoken });
      setVisibleMessages(prev => [...prev, { role: "assistant", content: spoken, blocks: data.blocks || [] }]);
      // Persist assistant turn to the shared thread
      if (threadId && onPersistMessage) {
        void onPersistMessage(threadId, {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: `🎤 ${spoken}`,
          ts: Date.now(),
        });
      }
      setThinking(false);
      await speak(spoken);
    } catch (err) {
      if ((err as any)?.name === "AbortError") {
        await handleAbort();
      } else {
        console.error("voice copilot error", err);
        setThinking(false);
        await speak("I had trouble reaching the assistant. Please check your connection and try again.");
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }, [threadId, onPersistMessage, identityPayload, speak, stripForVoice]);

  const { listening, status, errorMsg, start, stop } = useVoiceDictation({
    onTranscript: async (text) => {
      if (handlingRef.current) return;
      handlingRef.current = true;
      const utterance = text.trim();
      setTranscript(utterance);
      // Barge-in: cut TTS immediately
      stopTts();
      setSpeaking(false);
      try {
        await callVoiceCopilot(utterance);
      } finally {
        handlingRef.current = false;
        setTranscript("");
        if (autoListenRef.current && open) {
          window.setTimeout(() => { try { start(); } catch { /* noop */ } }, 250);
        }
      }
    },
  });

  // Greet on open — preserve conversation history across re-opens
  useEffect(() => {
    if (!open) return;
    setLastSpoken("");
    setTranscript("");
    // Only greet + clear history on the very first open (no prior messages)
    const isFirstOpen = messagesRef.current.length === 0;
    if (!isFirstOpen) {
      // Resume: just restart mic without greeting
      if (autoListenRef.current) {
        window.setTimeout(() => { try { start(); } catch { /* noop */ } }, 200);
      }
      return;
    }
    const greet = "Hi! I'm listening. What would you like to do?";
    setLastSpoken(greet);
    setVisibleMessages([{ role: "assistant", content: greet }]);
    if (!muted) {
      void speakTts(greet, {
        onStart: () => setSpeaking(true),
        onEnd: () => {
          setSpeaking(false);
          if (open && autoListenRef.current) {
            window.setTimeout(() => { try { start(); } catch { /* noop */ } }, 200);
          }
        },
      }).catch(() => setSpeaking(false));
    } else if (autoListenRef.current) {
      window.setTimeout(() => { try { start(); } catch { /* noop */ } }, 200);
    }
    return () => {
      stopTts();
      setSpeaking(false);
      try { stop(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    autoListenRef.current = false;
    stopTts();
    try { stop(); } catch { /* noop */ }
    onClose();
    autoListenRef.current = true;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-n900/80 flex items-center justify-center backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-card rounded-3xl w-[440px] max-h-[640px] p-7 flex flex-col items-center gap-5 shadow-2xl relative"
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 h-8 w-8 grid place-items-center rounded-md text-n400 hover:text-n800 hover:bg-n100"
          aria-label="Close"
        ><X className="h-4 w-4" /></button>

        <div className="flex flex-col items-center gap-1">
          <h3 className="text-[16px] font-bold text-n900">Voice Copilot</h3>
          <p className="text-[11px] text-n500">Speak naturally · I'll confirm before any change</p>
        </div>

        <div className="relative">
          {(listening || speaking) && (
            <span className={cn(
              "absolute inset-0 rounded-full animate-ping",
              listening ? "bg-red-400/40" : "bg-orange-400/40",
            )} aria-hidden />
          )}
          <motion.div
            animate={listening || speaking ? { scale: [1, 1.06, 1] } : {}}
            transition={{ duration: 1.4, repeat: Infinity }}
            className={cn(
              "relative h-32 w-32 rounded-full grid place-items-center transition-colors",
              listening ? "bg-red-50 border-2 border-red-300" :
              thinking ? "bg-blue-50 border-2 border-blue-200" :
              speaking ? "bg-orange-50 border-2 border-orange-300" :
              status === "error" ? "bg-coral-50 border-2 border-coral-200" :
              "bg-n100 border-2 border-n200",
            )}
          >
            {status === "requesting" ? <Loader2 className="h-10 w-10 text-orange-500 animate-spin" /> :
             thinking ? <Loader2 className="h-10 w-10 text-blue-500 animate-spin" /> :
             status === "error" ? <AlertTriangle className="h-10 w-10 text-coral-500" /> :
             listening ? <Mic className="h-10 w-10 text-red-500" /> :
             speaking ? <Radio className="h-10 w-10 text-orange-500" /> :
             <Mic className="h-10 w-10 text-n400" />}
          </motion.div>
        </div>

        <div className="text-[13px] text-n600 font-medium text-center min-h-[20px]">
          {status === "error" ? <span className="text-coral-600">{errorMsg}</span> :
           status === "requesting" ? "Waiting for mic permission…" :
           thinking ? "Thinking…" :
           listening ? "Listening…" :
           speaking ? "Speaking…" :
           status === "unsupported" ? "Voice not supported in this browser" :
           "Tap the mic to speak"}
        </div>

        {/* Conversation history */}
        {(visibleMessages.length > 0 || transcript) && (
          <div className="w-full flex flex-col gap-2 max-h-[200px] overflow-y-auto">
            {visibleMessages.map((msg, idx) => (
              <div key={idx} className={cn("flex w-full", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[90%] px-3 py-2 rounded-2xl text-[12.5px] leading-snug",
                  msg.role === "user"
                    ? "bg-orange-100 text-orange-900 rounded-tr-sm"
                    : "bg-n100 text-n800 rounded-tl-sm"
                )}>
                  {msg.content}
                  {!!msg.blocks?.length && renderVoiceBlocks(msg.blocks)}
                </div>
              </div>
            ))}
            {transcript && (
              <div className="flex justify-end w-full">
                <div className="max-w-[90%] px-3 py-2 rounded-2xl rounded-tr-sm text-[12.5px] bg-orange-50 text-orange-700 italic border border-dashed border-orange-200">
                  {transcript}…
                </div>
              </div>
            )}
            <div ref={scrollEndRef} />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (listening) { stop(); }
              else { stopTts(); setSpeaking(false); start(); }
            }}
            disabled={status === "unsupported" || thinking}
            className={cn(
              "h-12 w-12 rounded-full grid place-items-center transition-all shadow-sm",
              status === "unsupported" || thinking ? "bg-n200 text-n400 cursor-not-allowed" :
              listening ? "bg-red-500 text-white hover:bg-red-600" :
              "bg-orange-500 text-white hover:bg-orange-600",
            )}
            aria-label={listening ? "Stop listening" : "Start listening"}
          >
            {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          {/* Always-listen toggle */}
          <button
            onClick={() => setAlwaysListen(v => !v)}
            title={alwaysListen ? "Auto-listen on (tap to disable)" : "Auto-listen off (tap to enable)"}
            className={cn(
              "h-10 px-3 rounded-xl text-[12px] font-medium transition-colors flex items-center gap-1.5",
              alwaysListen
                ? "bg-green-100 text-green-700 ring-1 ring-green-300"
                : "bg-n100 text-n500 hover:bg-n200",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full inline-block", alwaysListen ? "bg-green-500" : "bg-n400")} />
            Auto
          </button>

          <button
            onClick={() => {
              setMuted(m => {
                const next = !m;
                if (next) stopTts();
                return next;
              });
            }}
            className={cn(
              "h-10 px-4 rounded-xl text-[12.5px] font-medium transition-colors",
              muted ? "bg-n200 text-n700" : "bg-n100 text-n700 hover:bg-n200",
            )}
            title={muted ? "Voice replies muted" : "Mute voice replies"}
          >
            {muted ? "Unmute" : "Mute"}
          </button>

          {speaking && (
            <button
              onClick={() => { stopTts(); setSpeaking(false); }}
              className="h-10 px-4 rounded-xl bg-n100 text-n700 text-[12.5px] font-medium hover:bg-n200"
            >Stop</button>
          )}
        </div>

        {/* Clear conversation history */}
        {visibleMessages.length > 1 && (
          <button
            onClick={() => {
              messagesRef.current = [];
              setVisibleMessages([]);
              pendingActionRef.current = null;
            }}
            className="text-[11px] text-n400 hover:text-n600 transition-colors mt-1"
          >
            Clear conversation
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
