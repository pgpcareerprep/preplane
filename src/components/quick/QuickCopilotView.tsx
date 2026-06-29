/**
 * /quick/copilot — Mobile LMP Copilot.
 *
 * Uses existing askCopilot() (which calls the copilot-ai edge function).
 * No new providers, no desktop wrapper, no mock data.
 * RBAC enforced: admin-summary mode = read-only scope.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Send, X, ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { askCopilot } from "@/lib/copilotEngine";
import { QUICK_PROMPTS } from "@/lib/config/copilotPrompts";
import { useLmpProcesses } from "@/lib/hooks/useDbData";
import { useQuickMode } from "@/pages/QuickActionsPage";

// Mobile-focused quick prompts for POC context
const MOBILE_PROMPTS = [
  { label: "Summarize this LMP", prompt: "Summarize the current status, candidates, and recent progress of this LMP process." },
  { label: "What is pending?", prompt: "What is pending for this LMP? List uncompleted checklist items, missing updates, and upcoming actions." },
  { label: "Draft progress update", prompt: "Draft a concise daily progress note for today for this LMP." },
  { label: "Show checklist gaps", prompt: "Which checklist items are not yet completed for this LMP? List them with suggested next steps." },
  { label: "Candidates by stage", prompt: "List all candidates for this LMP organized by their current pipeline stage." },
  { label: "What's next?", prompt: "What should be updated or done next for this LMP? Suggest the highest-priority action." },
  { label: "POC workload", prompt: "Show current active load for all POCs, flag anyone above 80% capacity." },
  { label: "Stale processes", prompt: "Which active LMP processes haven't had a progress update in 14+ days?" },
];

interface Message {
  role: "user" | "assistant" | "error";
  content: string;
}

export function QuickCopilotView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { mode } = useQuickMode();
  const isReadOnly = mode === "admin-summary";

  const { data: allLmps = [] } = useLmpProcesses();

  const [lmpId, setLmpId] = useState<string>(searchParams.get("lmp") ?? "");
  const [lmpOpen, setLmpOpen] = useState(false);
  const [lmpSearch, setLmpSearch] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const selectedLmp = (allLmps as any[]).find((r) => r.id === lmpId);

  const filteredLmps = (allLmps as any[]).filter((r) => {
    if (!lmpSearch.trim()) return true;
    const q = lmpSearch.toLowerCase();
    return String(r.company ?? "").toLowerCase().includes(q) || String(r.role ?? "").toLowerCase().includes(q);
  }).slice(0, 50);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setLoading(true);
    try {
      const reply = await askCopilot({
        prompt: trimmed,
        mode: "auto",
        lmpId: lmpId || undefined,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply || "No response." }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "error", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }, [loading, lmpId]);

  return (
    <div
      className="flex flex-col bg-background text-foreground"
      style={{ height: "100dvh" }}
    >
      {/* Header */}
      <header
        className="flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-3 shrink-0"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-tight">LMP Copilot</h1>
            {isReadOnly && (
              <p className="text-[10px] text-amber-600 font-medium">Read-only (Admin Summary mode)</p>
            )}
          </div>
        </div>
      </header>

      {/* LMP context selector */}
      <div className="border-b border-border bg-muted/20 px-4 py-2 shrink-0">
        {selectedLmp ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground">Context: LMP</p>
              <p className="text-xs font-semibold line-clamp-1">{selectedLmp.company} — {selectedLmp.role}</p>
            </div>
            <button
              onClick={() => { setLmpId(""); setLmpOpen(false); }}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setLmpOpen((o) => !o)}
            className="text-xs text-primary font-semibold py-1"
          >
            + Set LMP context (optional)
          </button>
        )}

        {/* LMP picker dropdown */}
        {lmpOpen && !selectedLmp && (
          <div className="mt-2 rounded-2xl border border-border bg-background shadow-md overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <input
                autoFocus
                placeholder="Search LMP…"
                className="w-full text-sm bg-transparent outline-none"
                value={lmpSearch}
                onChange={(e) => setLmpSearch(e.target.value)}
              />
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-border/50">
              {filteredLmps.map((r: any) => (
                <button
                  key={r.id}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors"
                  onClick={() => { setLmpId(r.id); setLmpOpen(false); setLmpSearch(""); }}
                >
                  <p className="text-xs font-semibold line-clamp-1">{r.company}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{r.role}</p>
                </button>
              ))}
              {filteredLmps.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No matches</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <>
            <div className="text-center py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mx-auto mb-3">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-semibold">LMP Copilot</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Ask anything about your LMP processes. {lmpId ? "Context set." : "Optionally set an LMP context above."}
              </p>
            </div>

            {/* Quick prompts */}
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest px-1">Quick Prompts</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(lmpId ? MOBILE_PROMPTS : QUICK_PROMPTS.map((p) => ({ label: p.title, prompt: p.prompt }))).slice(0, 6).map(({ label, prompt }) => (
                  <button
                    key={label}
                    onClick={() => send(lmpId ? prompt : prompt)}
                    disabled={loading}
                    className="rounded-xl border border-border bg-card px-3 py-3 text-left text-xs font-medium hover:bg-muted/30 active:scale-[0.97] transition-all disabled:opacity-40"
                    style={{ minHeight: "52px" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
            {msg.role === "assistant" && (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5 mr-2">
                <Sparkles className="h-3 w-3 text-primary" />
              </div>
            )}
            <div
              className={[
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : msg.role === "error"
                  ? "bg-rose-50 text-rose-600 border border-rose-200"
                  : "bg-card border border-border rounded-bl-md",
              ].join(" ")}
            >
              {msg.role === "user" ? (
                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div className="prose prose-sm max-w-none text-foreground leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5 mr-2">
              <Sparkles className="h-3 w-3 text-primary" />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2].map((n) => (
                  <span
                    key={n}
                    className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                    style={{ animationDelay: `${n * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        className="border-t border-border bg-background/95 backdrop-blur px-4 pt-3 shrink-0"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            placeholder={isReadOnly ? "Ask about any LMP (read-only mode)…" : "Ask anything about your LMPs…"}
            className="flex-1 resize-none rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 max-h-32 overflow-y-auto leading-relaxed"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={loading}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        {isReadOnly && (
          <p className="text-[10px] text-amber-600 text-center mt-1.5">
            Admin Summary mode — Copilot is read-only. Switch to My POC Actions to run mutations.
          </p>
        )}
      </div>
    </div>
  );
}
