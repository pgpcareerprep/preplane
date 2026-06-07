import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  formatRelativeTime,
  useTimeline,
  addTimelineComment,
  type TimelineEntryKind,
  type TimelineEntry,
} from "@/lib/lmpExecutionEngine";
import {
  Activity,
  CheckSquare,
  ArrowRightLeft,
  Paperclip,
  MinusCircle,
  MessageSquarePlus,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";

type Filter = "all" | "progress" | "checklist" | "candidate-move" | "attachment" | "mentor" | "update";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all",            label: "All" },
  { id: "progress",       label: "Progress" },
  { id: "checklist",      label: "Checklist" },
  { id: "candidate-move", label: "Movement" },
  { id: "mentor",         label: "Mentors" },
  { id: "attachment",     label: "Attachments" },
  { id: "update",         label: "Updates" },
];

const KIND_ICON: Record<TimelineEntryKind, LucideIcon> = {
  progress: Activity,
  "no-update": MinusCircle,
  checklist: CheckSquare,
  comment: Activity,
  remark: Activity,
  "candidate-move": ArrowRightLeft,
  mentor: Activity,
  attachment: Paperclip,
  update: Activity,
};

const KIND_DOT: Record<TimelineEntryKind, string> = {
  progress: "bg-orange-500",
  "no-update": "bg-n300",
  checklist: "bg-teal-500",
  comment: "bg-n400",
  remark: "bg-n400",
  "candidate-move": "bg-plum-400",
  mentor: "bg-yellow-500",
  attachment: "bg-sage-500",
  update: "bg-sky-500",
};

const COLLAPSED_LIMIT = 3;

export function ActivityTimelineCard({ lmpId }: { lmpId: string }) {
  const all = useTimeline(lmpId);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);
  const filtered = filter === "all" ? all : all.filter((e) => e.kind === filter);
  const items = expanded ? filtered : filtered.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = Math.max(0, filtered.length - items.length);

  useEffect(() => {
    if (!lmpId) return;
    const ch = supabase
      .channel(`lmp_timeline_${lmpId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lmp_timeline" },
        () => qc.invalidateQueries({ queryKey: ["exec_timeline", lmpId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [lmpId, qc]);


  return (
    <div className="rounded-2xl bg-card border border-n200 shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h4 className="text-[14px] font-semibold text-n900">Activity Timeline</h4>
          <span className="text-[11px] text-n400 tabular-nums">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "h-7 px-2.5 rounded-full text-[11.5px] font-medium border transition-colors",
                filter === f.id
                  ? "bg-n900 text-white border-n900"
                  : "bg-card text-n600 border-n200 hover:border-n300",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-[12.5px] italic text-n400 py-6 text-center">
          No activity yet. Log progress, tick checklist items, or move candidates to see entries here.
        </div>
      ) : (
        <>
          <ul className="relative pl-5 space-y-3">
            <span className="absolute left-1.5 top-1 bottom-1 w-px bg-n200" />
            {items.map((e) => (
              <TimelineRow key={e.id} entry={e} lmpId={lmpId} />
            ))}
          </ul>
          {filtered.length > COLLAPSED_LIMIT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-orange-600 hover:text-orange-700"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" /> Collapse Timeline
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" /> Expand Timeline
                  {hiddenCount > 0 && (
                    <span className="text-n400 ml-1">(+{hiddenCount} more)</span>
                  )}
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TimelineRow({ entry: e, lmpId }: { entry: TimelineEntry; lmpId: string }) {
  const Icon = KIND_ICON[e.kind] ?? Activity;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = useCallback(async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      await addTimelineComment(lmpId, e.id, text);
      setText("");
      setOpen(false);
    } catch (err) {
      toast.error(`Couldn't add note: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, lmpId, e.id]);
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[14px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white",
          KIND_DOT[e.kind],
        )}
      />
      <div className="flex items-start gap-2">
        <Icon className="h-3.5 w-3.5 text-n400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] text-n800 leading-snug">{e.text}</div>
          <div className="text-[11px] text-n400 mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="tabular-nums">{formatRelativeTime(e.ts)}</span>
            {e.author && (
              <>
                <span className="text-n300">·</span>
                <span>{e.author}</span>
              </>
            )}
            {e.attachmentName && (
              <>
                <span className="text-n300">·</span>
                <span className="inline-flex items-center gap-1 text-orange-600">
                  <Paperclip className="h-3 w-3" /> {e.attachmentName}
                </span>
              </>
            )}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="ml-auto inline-flex items-center gap-1 text-n500 hover:text-orange-600"
            >
              <MessageSquarePlus className="h-3 w-3" />
              {e.comments?.length ? `${e.comments.length} comment${e.comments.length > 1 ? "s" : ""}` : "Comment"}
            </button>
          </div>

          {(e.comments?.length ?? 0) > 0 && (
            <ul className="mt-1.5 space-y-1 border-l-2 border-n100 pl-2">
              {e.comments!.map((c) => (
                <li key={c.id} className="text-[12px] text-n700 leading-snug">
                  <span className="text-orange-600">💬</span> “{c.text}”
                  <span className="text-[10.5px] text-n400 ml-1.5">— {c.author}</span>
                </li>
              ))}
            </ul>
          )}

          {open && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                value={text}
                onChange={(ev) => setText(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === "Enter" && !submitting) { ev.preventDefault(); void submit(); } }}
                placeholder="Add a comment…"
                autoFocus
                disabled={submitting}
                className="flex-1 h-7 px-2 rounded-md border border-n200 bg-card text-[12px] text-n800 focus:outline-none focus:border-orange-300 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!text.trim() || submitting}
                className="h-7 px-2.5 rounded-md bg-n900 text-white text-[11.5px] font-medium disabled:opacity-40"
              >
                {submitting ? "…" : "Post"}
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}