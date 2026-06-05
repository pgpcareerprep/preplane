import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  MessageCircle,
  CheckSquare,
  UserRound,
  ArrowRightCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { format, isSameDay, startOfDay, subDays } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/rolesContext";
import { useMotionPreset } from "@/lib/useMotionPreset";
import { DEFAULT_CHIPS } from "@/lib/lmpExecutionEngine";
import {
  useLmpDailyLogs,
  useAddProgressLog,
  type LmpDailyLog,
  type LmpDailyLogEntryType,
} from "@/lib/hooks/useLmpDailyLogs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FilterMode = "all" | "progress" | "comment";

const TYPE_CONFIG: Record<
  LmpDailyLogEntryType,
  { dot: string; icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  progress:       { dot: "bg-blue-500",   icon: Activity,         label: "Progress" },
  no_update:      { dot: "bg-n300",       icon: Activity,         label: "No update" },
  comment:        { dot: "bg-violet-500", icon: MessageCircle,    label: "Comment" },
  checklist:      { dot: "bg-sage-500",   icon: CheckSquare,      label: "Checklist" },
  mentor:         { dot: "bg-amber-500",  icon: UserRound,        label: "Mentor" },
  candidate_move: { dot: "bg-coral-500",  icon: ArrowRightCircle, label: "Candidate" },
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function dateGroupLabel(d: Date, today: Date): string {
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, subDays(today, 1))) return "Yesterday";
  return format(d, "MMM d");
}

function timeLabel(iso: string, today: Date): string {
  const d = new Date(iso);
  if (isSameDay(d, today)) return format(d, "HH:mm");
  return format(d, "MMM d, HH:mm");
}

export function LmpTimeline({ lmpId }: { lmpId?: string }) {
  const m = useMotionPreset();
  const { user } = useRole();
  const { data: logs, isLoading, isError, refetch } = useLmpDailyLogs(lmpId);
  const addLog = useAddProgressLog(lmpId ?? "");

  const [text, setText] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [visibleCount, setVisibleCount] = useState(20);

  const toggleChip = (c: string) =>
    setChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || !lmpId) return;
    addLog.mutate(
      {
        text: trimmed,
        chips,
        entry_type: "progress",
        author_name: user?.name || user?.email || "You",
        author_email: user?.email || null,
      },
      {
        onSuccess: () => {
          setText("");
          setChips([]);
          toast.success("Progress note added");
        },
        onError: (e: any) => toast.error(e?.message || "Failed to add note"),
      },
    );
  };

  const filtered = useMemo(() => {
    const all = logs ?? [];
    if (filter === "progress") return all.filter((l) => l.entry_type === "progress" || l.entry_type === "no_update");
    if (filter === "comment") return all.filter((l) => l.entry_type === "comment");
    return all;
  }, [logs, filter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  // group visible entries by day
  const today = startOfDay(new Date());
  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; items: LmpDailyLog[] }> = [];
    for (const item of visible) {
      const d = startOfDay(new Date(item.created_at));
      const key = d.toISOString();
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: dateGroupLabel(d, today), items: [] };
        out.push(g);
      }
      g.items.push(item);
    }
    return out;
  }, [visible, today]);

  const showComposer = !!lmpId;

  return (
    <section className="rounded-2xl bg-card shadow-sm border border-n200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[16px] font-semibold text-n800">Progress Timeline</h4>
        <Select value={filter} onValueChange={(v) => { setFilter(v as FilterMode); setVisibleCount(20); }}>
          <SelectTrigger className="h-8 w-[150px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entries</SelectItem>
            <SelectItem value="progress">Progress only</SelectItem>
            <SelectItem value="comment">Comments only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showComposer && (
        <div className="mb-5 rounded-xl border border-n200 bg-n50/40 p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            placeholder="Add a progress note…"
            rows={2}
            className="w-full resize-none rounded-md border border-n200 bg-card px-3 py-2 text-[13px] text-n800 placeholder:text-n400 focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEFAULT_CHIPS.map((c) => {
              const on = chips.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleChip(c)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                    on
                      ? "border-orange-300 bg-orange-100 text-orange-700"
                      : "border-n200 bg-card text-n600 hover:bg-n100",
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-n400">{text.length}/500</span>
            <button
              type="button"
              disabled={!text.trim() || addLog.isPending}
              onClick={submit}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium shadow-sm transition-colors",
                text.trim() && !addLog.isPending
                  ? "bg-orange-500 hover:bg-orange-600 text-white"
                  : "bg-n200 text-n400 cursor-not-allowed",
              )}
            >
              {addLog.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Post update
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-2.5 w-2.5 rounded-full bg-n200 mt-2" />
              <div className="flex-1 space-y-2">
                <div className="h-2 w-24 bg-n100 rounded" />
                <div className="h-3 w-3/4 bg-n100 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-start gap-2 rounded-md border border-coral-200 bg-coral-50 p-3 text-[12px] text-coral-700">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <div className="flex-1">Failed to load timeline.</div>
          <button onClick={() => refetch()} className="font-medium underline">Retry</button>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <p className="text-[13px] text-n500 italic">
          {(logs?.length ?? 0) === 0
            ? "No progress entries yet. Add the first one above."
            : "No entries match this filter."}
        </p>
      )}

      {!isLoading && !isError && groups.length > 0 && (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-n500">{g.label}</span>
                <div className="flex-1 h-px bg-n100" />
              </div>
              <ul className="relative pl-6 space-y-3">
                <div className="absolute left-2 top-1 bottom-1 w-px bg-n200" />
                {g.items.map((entry, i) => {
                  const cfg = TYPE_CONFIG[entry.entry_type] ?? TYPE_CONFIG.progress;
                  const Icon = cfg.icon;
                  return (
                    <motion.li
                      key={entry.id}
                      initial={m.fadeUp.initial}
                      animate={m.fadeUp.animate}
                      transition={m.fadeUp.transition(i)}
                      className={cn("relative", entry._optimistic && "opacity-60")}
                    >
                      <span
                        className={cn(
                          "absolute -left-[18px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white",
                          cfg.dot,
                        )}
                      />
                      <div className="flex items-center gap-2 text-[11px] text-n500">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-n100 text-[10px] font-semibold text-n700">
                          {initialsOf(entry.author_name)}
                        </span>
                        <span className="font-medium text-n700">{entry.author_name}</span>
                        <span className="text-n400">·</span>
                        <span className="tabular-nums">{timeLabel(entry.created_at, today)}</span>
                        <span className="text-n400">·</span>
                        <Icon className="h-3 w-3 text-n400" />
                        <span className="text-n400">{cfg.label}</span>
                      </div>
                      <div className={cn(
                        "mt-1 text-[13px] leading-snug",
                        entry.entry_type === "no_update" ? "italic text-n500" : "text-n800",
                      )}>
                        {entry.entry_type === "no_update" && !entry.text ? "No update" : entry.text}
                      </div>
                      {entry.chips?.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {entry.chips.map((c) => (
                            <span
                              key={c}
                              className="rounded-full bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 text-[10px]"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + 20)}
                className="text-[12px] font-medium text-orange-600 hover:text-orange-700 underline underline-offset-2"
              >
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
