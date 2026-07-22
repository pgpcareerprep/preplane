import { useState, useMemo, useEffect } from "react";
import { Send, MinusCircle, CalendarClock, History, ChevronDown, AlertTriangle, Mail, Pencil, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/rolesContext";
import { format, isAfter, isBefore, isToday as isDateToday, parseISO } from "date-fns";
import {
  hasUpdateToday,
  useProgress,
} from "@/lib/lmpExecutionEngine";
import { cn } from "@/lib/utils";
import {
  useProgressHistory,
  useAddProgressEntry,
  useSaveNextProgressDate,
  useUpdateLastProgressAt,
  useUpdateProgressEntry,
  useDeleteProgressEntry,
} from "@/lib/hooks/useProgressHistory";
import { Textarea } from "@/components/ui/textarea";
import { useLmpProcesses } from "@/lib/hooks/useDbData";
import { useLmpPermission } from "@/lib/hooks/usePermissions";
import { normalizeNextProgressType, NEXT_PROGRESS_TYPES } from "@/lib/nextProgressType";

// Sheets → DB auto-pull is removed. DB is the source of truth; the
// `sheets-retry-sweeper` cron handles DB → Sheet mirroring server-side.

type MergedEntry = {
  id: string;
  ts: number;
  date: string;
  dateDisplay: string;
  text: string;
  author: string;
  authorEmail?: string | null;
  source: "db" | "legacy";
  noUpdate?: boolean;
  editedAt?: string | null;
  nextExpectedAt?: number;
  nextExpectedKind?: string;
};

/** Split legacy sheet cell text into lines without inferring dates from URLs. */
function legacySheetLines(raw: string): MergedEntry[] {
  if (!raw.trim()) return [];
  return raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text, i) => ({
      id: `legacy-${i}`,
      ts: 0,
      date: "",
      dateDisplay: "",
      text,
      author: "Notes",
      source: "legacy" as const,
    }));
}

function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDbTimestamp(iso: string): Pick<MergedEntry, "ts" | "date" | "dateDisplay"> {
  const d = new Date(iso);
  return {
    ts: d.getTime(),
    date: toLocalDate(d),
    dateDisplay: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
  };
}

const progressMutationMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return fallback;
};

/**
 * Daily Progress card with DB-backed history, next progress date persistence,
 * and reminder status messages.
 */
export function DailyProgressCard({
  lmpId,
  compact = false,
  mode = "action",
  onSaveProgress,
  onSaveNextDate,
  initialPrepProgress,
  sheetDailyProgress,
  nextProgressDateFromDb,
  reminderTypeFromDb,
  pocEmail,
  lastProgressUpdatedAt,
  prepPocName,
  prepPocEmail,
  supportPocName,
  supportPocEmail,
}: {
  lmpId: string;
  compact?: boolean;
  mode?: "action" | "summary";
  onSaveProgress?: (text: string) => void;
  onSaveNextDate?: (date: string, type?: string, enableReminder?: boolean) => void;
  initialPrepProgress?: string;
  sheetDailyProgress?: string;
  nextProgressDateFromDb?: string | null;
  reminderTypeFromDb?: string | null;
  pocEmail?: string | null;
  lastProgressUpdatedAt?: string | null;
  prepPocName?: string | null;
  prepPocEmail?: string | null;
  supportPocName?: string | null;
  supportPocEmail?: string | null;
}) {
  const { data: lmpRows = [] } = useLmpProcesses({ includeArchived: true });
  const permissionRow = (lmpRows as any[]).find(
    (row) => row.id === lmpId || row.lmp_code === lmpId,
  );
  const { canOperateLmp } = useLmpPermission({
    prep_poc: permissionRow?.prep_poc,
    support_poc: permissionRow?.support_poc,
    outreach_poc: permissionRow?.outreach_poc,
    prep_poc_id: permissionRow?.prep_poc_id,
    support_poc_id: permissionRow?.support_poc_id,
    outreach_poc_ids: permissionRow?.outreach_poc_ids,
  });
  const effectiveMode = mode === "summary" || !canOperateLmp ? "summary" : "action";
  const localEntries = useProgress(lmpId);
  const noUpdateNeeded = !hasUpdateToday(localEntries);
  void localEntries;

  // DB-backed progress history
  const { data: dbHistory = [] } = useProgressHistory(lmpId);
  const addProgressEntry = useAddProgressEntry();
  const saveNextDate = useSaveNextProgressDate();
  const updateLastProgress = useUpdateLastProgressAt();

  const [text, setText] = useState("");
  const [nextDate, setNextDate] = useState<string>(nextProgressDateFromDb || "");
  const [nextKind, setNextKind] = useState<string>(normalizeNextProgressType(reminderTypeFromDb));
  const [showHistory, setShowHistory] = useState(false);
  const [dateSaved, setDateSaved] = useState(false);
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const { role, user } = useRole();
  const isAdmin = role === "admin";
  void isAdmin;
  void supabase;

  // Identify current author by matching their email against POC roles on this LMP
  const currentAuthorLabel = useMemo(() => {
    const myEmail = (user?.email || "").trim().toLowerCase();
    const myName = (user?.name || "").trim() || (myEmail ? myEmail.split("@")[0] : "POC");
    const prepEmail = (prepPocEmail || "").trim().toLowerCase();
    const supEmail = (supportPocEmail || "").trim().toLowerCase();
    if (myEmail && prepEmail && myEmail === prepEmail) return `Prep POC · ${prepPocName || myName}`;
    if (myEmail && supEmail && myEmail === supEmail) return `Support POC · ${supportPocName || myName}`;
    return myName;
  }, [user?.email, user?.name, prepPocName, prepPocEmail, supportPocName, supportPocEmail]);

  // Sync from DB when props change
  useEffect(() => {
    if (nextProgressDateFromDb && !nextDate) setNextDate(nextProgressDateFromDb);
  }, [nextProgressDateFromDb, nextDate]);
  useEffect(() => {
    const norm = normalizeNextProgressType(reminderTypeFromDb);
    if (norm !== nextKind) setNextKind(norm);
  }, [reminderTypeFromDb, nextKind]);

  // DB-backed progress history is the source of truth for dates/times.
  const mergedEntries = useMemo<MergedEntry[]>(() => {
    const fp = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const dbSeen = new Set<string>();
    const dbDedup: MergedEntry[] = [];

    for (const e of dbHistory) {
      const stamp = formatDbTimestamp(e.created_at);
      const text = e.progress_type === "no_update" ? "No update" : e.progress_text;
      const k = `${stamp.date}|${fp(text)}`;
      if (dbSeen.has(k)) continue;
      dbSeen.add(k);
      dbDedup.push({
        id: e.id,
        ...stamp,
        text,
        author: e.created_by || "POC",
        authorEmail: e.author_email,
        source: "db",
        noUpdate: e.progress_type === "no_update",
        editedAt: e.edited_at,
      });
    }

    if (dbDedup.length > 0) {
      return dbDedup.sort((a, b) => b.ts - a.ts);
    }

    // Legacy sheet-only LMPs: show lines without invented dates.
    return legacySheetLines(sheetDailyProgress || "");
  }, [dbHistory, sheetDailyProgress]);

  // Group by date; undated legacy notes stay in one bucket.
  const groupedByDate = useMemo(() => {
    const groups: Record<string, MergedEntry[]> = {};
    for (const e of mergedEntries) {
      const key = e.date || "__undated__";
      (groups[key] ??= []).push(e);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === "__undated__") return 1;
      if (b === "__undated__") return -1;
      return b.localeCompare(a);
    });
  }, [mergedEntries]);

  const totalCount = mergedEntries.length;

  // Status message logic
  const statusMessage = useMemo(() => {
    if (!nextDate) return null;
    const nextDateObj = parseISO(nextDate);
    if (isNaN(nextDateObj.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const formattedDate = format(nextDateObj, "dd MMM yyyy");

    // Check if progress was updated after the date was set
    const hasRecentUpdate = dbHistory.some(
      (e) => e.progress_type === "progress_update" && lastProgressUpdatedAt && isAfter(new Date(e.created_at), new Date(lastProgressUpdatedAt))
    );

    if (isBefore(nextDateObj, today)) {
      // Next date has passed
      const hasUpdateAfterDate = dbHistory.some(
        (e) => e.progress_type === "progress_update" && isAfter(new Date(e.created_at), nextDateObj)
      );
      if (!hasUpdateAfterDate) {
        return { type: "overdue" as const, text: `Progress update overdue since ${formattedDate}` };
      }
      return { type: "info" as const, text: `Next progress date was ${formattedDate}. Set a new date below.` };
    }

    if (isDateToday(nextDateObj) || isAfter(nextDateObj, today)) {
      if (text.trim()) {
        return { type: "early" as const, text: `You are updating before the next expected progress date: ${formattedDate}. You can keep or change the next progress date.` };
      }
      return { type: "info" as const, text: `Next progress expected on ${formattedDate}` };
    }

    return null;
  }, [nextDate, dbHistory, lastProgressUpdatedAt, text]);

  const progressBusy = addProgressEntry.isPending || updateLastProgress.isPending || saveNextDate.isPending;

  const submit = () => {
    if (!text.trim() || progressBusy) return;
    const savedText = text.trim();

    addProgressEntry.mutate(
      {
        lmpId,
        progressText: savedText,
        progressType: "progress_update",
        createdBy: currentAuthorLabel,
        nextProgressDateSnapshot: nextDate || null,
        reminderTypeSnapshot: nextKind || null,
      },
      {
        onSuccess: () => {
          onSaveProgress?.(savedText);
          updateLastProgress.mutate(lmpId, {
            onError: (err) => {
              toast.error(progressMutationMessage(err, "Progress saved, but couldn't refresh last-updated timestamp"));
            },
          });
          if (nextDate) {
            saveNextDate.mutate({
              lmpId,
              nextDate,
              reminderType: nextKind || "",
              pocEmail: pocEmail || undefined,
            });
          }
          setText("");
          toast.success("Progress saved");
        },
        onError: (err) => {
          toast.error(progressMutationMessage(err, "Failed to save progress"));
        },
      },
    );
  };

  const handleMarkNoUpdate = () => {
    if (progressBusy) return;
    addProgressEntry.mutate(
      {
        lmpId,
        progressText: "No update marked for today",
        progressType: "no_update",
        createdBy: currentAuthorLabel,
        nextProgressDateSnapshot: nextDate || null,
        reminderTypeSnapshot: nextKind || null,
      },
      {
        onSuccess: () => {
          toast.success("Marked as no update today");
        },
        onError: (err) => {
          toast.error(progressMutationMessage(err, "Failed to mark no update"));
        },
      },
    );
  };

  const clearNudge = () => {
    setNextDate("");
    setNextKind("");
    saveNextDate.mutate({ lmpId, nextDate: null, reminderType: "", pocEmail: pocEmail || undefined, skipReminder: true });
    onSaveNextDate?.("", "", false);
    toast.success("Nudge cleared");
  };

  if (effectiveMode === "summary") {
    const latest = mergedEntries[0];
    const nextEntry = mergedEntries.find((e) => e.nextExpectedAt);
    return (
      <div className="rounded-2xl bg-n50/40 border border-n200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[13px] font-semibold text-n800">Daily Progress</h4>
          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-n200 bg-card text-[11.5px] text-n600 hover:text-n900 hover:border-n300 transition-colors"
              >
                <History className="h-3.5 w-3.5" />
                {showHistory ? "Hide history" : "View all history"}
                <span className="text-n400 tabular-nums">({totalCount})</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", showHistory && "rotate-180")} />
              </button>
            )}
            {latest ? (
              <div className="flex items-center gap-1.5">
                {latest.source === "db" && latest.dateDisplay && (
                  <span className="text-[10.5px] text-n500 tabular-nums">{latest.dateDisplay}</span>
                )}
              </div>
            ) : (
              <span className="text-[10.5px] text-n400 italic">No updates yet</span>
            )}
          </div>
        </div>
        {latest ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] text-n500">
              {latest.source === "db" && latest.dateDisplay && (
                <>
                  <span className="tabular-nums">{latest.dateDisplay}</span>
                  <span className="text-n300">·</span>
                  <span className="tabular-nums">
                    {new Date(latest.ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="text-n300">·</span>
                </>
              )}
              <span className="font-medium text-n700">{latest.author}</span>
            </div>
            <p className="text-[12.5px] text-n800 leading-snug line-clamp-2">"{latest.text}"</p>
          </div>
        ) : (
          <p className="text-[12.5px] text-n500 italic">No progress logged yet.</p>
        )}
        {showHistory && (
          <div className="mt-3 pt-3 border-t border-n200/70 space-y-3 max-h-[320px] overflow-y-auto">
            {groupedByDate.length === 0 ? (
              <p className="text-[12.5px] text-n400 italic py-2 text-center">No progress entries yet.</p>
            ) : (
              groupedByDate.map(([dateKey, dateEntries]) => (
                <div key={dateKey}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-px flex-1 bg-n200" />
                    <span className="text-[10.5px] font-semibold text-n500 tabular-nums tracking-wide uppercase">
                      {dateKey === "__undated__" ? "Notes" : dateEntries[0].dateDisplay}
                    </span>
                    <div className="h-px flex-1 bg-n200" />
                  </div>
                  <div className="space-y-1.5">
                    {dateEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-n200 bg-card p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[11.5px] font-medium text-n700 truncate">{entry.author}</span>
                          {entry.source === "db" && entry.dateDisplay && (
                            <span className="text-[10.5px] text-n400 tabular-nums shrink-0">
                              {entry.dateDisplay}
                              {" · "}
                              {new Date(entry.ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        <p className="text-[12.5px] text-n800 leading-snug whitespace-pre-wrap">
                          {entry.noUpdate ? <span className="italic text-n500">No update</span> : entry.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        <div className="mt-3 pt-2.5 border-t border-n200/70 flex items-center gap-1.5 text-[11.5px] text-n600">
          <CalendarClock className="h-3.5 w-3.5 text-n400" />
          {nextDate ? (
            <span>
              Next:{" "}
              <span className="text-n800 font-medium">
                {(() => { const d = parseISO(nextDate); return isNaN(d.getTime()) ? nextDate : format(d, "dd MMM"); })()}
              </span>
              {nextKind ? <span className="text-n500"> · {nextKind}</span> : null}
            </span>
          ) : nextEntry?.nextExpectedAt ? (
            <span>
              Next:{" "}
              <span className="text-n800 font-medium">
                {new Date(nextEntry.nextExpectedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </span>
              {nextEntry.nextExpectedKind && <span className="text-n500"> · {nextEntry.nextExpectedKind}</span>}
            </span>
          ) : (
            <span className="text-n500">No next update scheduled</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card border border-n200 shadow-sm p-4 h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-[13px] font-semibold text-n800">Daily Progress</h4>
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-n200 bg-card text-[11.5px] text-n600 hover:text-n900 hover:border-n300 transition-colors"
          >
            <History className="h-3.5 w-3.5" /> History ({totalCount})
            <ChevronDown className={cn("h-3 w-3 transition-transform", showHistory && "rotate-180")} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {noUpdateNeeded && (
            <span className="text-[11px] text-orange-600 bg-orange-50 border border-orange-100 rounded-full px-2 py-[2px]">
              No update today
            </span>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || progressBusy}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-n900 text-white text-[11.5px] font-medium hover:bg-n800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" /> {progressBusy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div
          className={cn(
            "rounded-lg px-3 py-2 mb-3 text-[12px] flex items-start gap-2",
            statusMessage.type === "overdue" && "bg-red-50 border border-red-200 text-red-700",
            statusMessage.type === "early" && "bg-amber-50 border border-amber-200 text-amber-700",
            statusMessage.type === "info" && "bg-blue-50 border border-blue-200 text-blue-700",
          )}
        >
          {statusMessage.type === "overdue" && <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          {statusMessage.type === "early" && <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          {statusMessage.type === "info" && <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* POC email warning */}
      {nextDate && !pocEmail && (
        <div className="rounded-lg px-3 py-2 mb-3 text-[12px] bg-yellow-50 border border-yellow-200 text-yellow-700 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          POC email missing. Reminder cannot be sent.
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What daily progress for this LMP?"
        rows={compact ? 2 : 3}
        className="w-full flex-1 min-h-[80px] resize-none rounded-md border border-n200 bg-n50/50 px-3 py-2 text-[13px] text-n800 placeholder:text-n400 focus:outline-none focus:border-orange-300 focus:bg-card transition-colors"
      />

      {/* Next Expected Progress */}
      <div className="mt-3 rounded-lg border border-n200 bg-n50/40 px-3 py-2">
        <div className="flex items-center gap-2 mb-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-n500" />
          <span className="text-[11.5px] font-medium text-n700">Next expected progress</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={nextDate}
            onChange={(e) => {
              const newDate = e.target.value;
              setNextDate(newDate);
              if (newDate) {
                onSaveNextDate?.(newDate, nextKind || "", sendConfirmation);
                setDateSaved(true);
                setTimeout(() => setDateSaved(false), 2500);
              } else {
                setDateSaved(false);
              }
            }}
            className="h-7 rounded-md border border-n200 bg-card px-2 text-[12px] text-n800 focus:outline-none focus:border-orange-300"
          />
          <select
            value={nextKind}
            onChange={(e) => {
              const newKind = e.target.value;
              setNextKind(newKind);
              if (nextDate) {
                onSaveNextDate?.(nextDate, newKind, sendConfirmation);
                setDateSaved(true);
                setTimeout(() => setDateSaved(false), 2500);
              }
            }}
            className="h-7 rounded-md border border-n200 bg-card px-2 text-[12px] text-n800 focus:outline-none focus:border-orange-300"
          >
            <option value="">Select type</option>
            {NEXT_PROGRESS_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          {dateSaved && (
            <span className="text-[11px] text-emerald-600 flex items-center gap-1 animate-fade-in">
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Saved
            </span>
          )}
          {nextDate && (
            <button
              type="button"
              onClick={clearNudge}
              className="h-7 px-2 rounded-md border border-n200 bg-card text-[11.5px] text-n600 hover:bg-n100 hover:text-coral-600 transition-colors"
            >
              Clear
            </button>
          )}
          <span className="text-[11px] text-n400">Reminder fires on this date at the time set in Notifications.</span>
        </div>
        {/* Email control */}
        <div className="mt-2 flex flex-wrap items-center gap-2 pt-2 border-t border-n200/70">
          <label className="inline-flex items-center gap-1.5 text-[11.5px] text-n600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendConfirmation}
              onChange={(e) => {
                setSendConfirmation(e.target.checked);
                if (nextDate) onSaveNextDate?.(nextDate, nextKind, e.target.checked);
              }}
              className="h-3 w-3 rounded border-n300 text-orange-500 focus:ring-orange-300"
            />
            <Mail className="h-3 w-3 text-n400" />
            Email POCs on the scheduled date
          </label>
        </div>
      </div>


      {/* Inline History */}
      {showHistory && (
        <div className="mt-3 space-y-3 max-h-[400px] overflow-y-auto">
          {groupedByDate.length === 0 ? (
            <p className="text-[13px] text-n400 italic py-4 text-center">No progress entries yet.</p>
          ) : (
            groupedByDate.map(([dateKey, dateEntries]) => (
              <div key={dateKey}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="h-px flex-1 bg-n200" />
                  <span className="text-[10.5px] font-semibold text-n500 tabular-nums tracking-wide uppercase">
                    {dateKey === "__undated__" ? "Notes" : dateEntries[0].dateDisplay}
                  </span>
                  <div className="h-px flex-1 bg-n200" />
                </div>
                <div className="space-y-1.5">
                  {dateEntries.map((entry) => (
                    <ProgressEntryCard
                      key={entry.id}
                      entry={entry}
                      lmpId={lmpId}
                      canManage={
                        entry.source === "db" &&
                        !entry.noUpdate &&
                        (role === "admin" ||
                          role === "allocator" ||
                          (effectiveMode === "action" &&
                            !!user?.email &&
                            !!entry.authorEmail &&
                            user.email.toLowerCase() === entry.authorEmail.toLowerCase()))
                      }
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProgressEntryCard({
  entry,
  lmpId,
  canManage,
}: {
  entry: MergedEntry;
  lmpId: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const updateEntry = useUpdateProgressEntry();
  const deleteEntry = useDeleteProgressEntry();
  const busy = updateEntry.isPending || deleteEntry.isPending;

  useEffect(() => {
    if (!editing) setDraft(entry.text);
  }, [entry.text, editing]);

  const onSave = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === entry.text || busy) return;
    updateEntry.mutate(
      { entryId: entry.id, lmpId, text: trimmed },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success("Progress updated");
        },
        onError: (error) =>
          toast.error(progressMutationMessage(error, "Couldn't update entry")),
      },
    );
  };

  const onDelete = () => {
    if (busy) return;
    if (!confirm("Delete this progress entry?")) return;
    deleteEntry.mutate(
      { entryId: entry.id, lmpId },
      {
        onSuccess: () => toast.success("Progress deleted"),
        onError: (error) =>
          toast.error(progressMutationMessage(error, "Couldn't delete entry")),
      },
    );
  };

  return (
    <div
      className={cn(
        "group rounded-lg border p-3",
        entry.noUpdate ? "border-n200 bg-n50/50" : "border-n200 bg-card",
      )}
    >
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12px] font-medium text-n700 truncate">{entry.author}</span>
          {entry.editedAt && (
            <span
              className="text-[9px] bg-n100 text-n600 border border-n200 rounded px-1.5 py-[1px] font-medium"
              title={`Edited ${new Date(entry.editedAt).toLocaleString()}`}
            >
              Edited
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {entry.source === "db" && entry.dateDisplay && (
            <span className="text-[10.5px] text-n400 tabular-nums">
              {entry.dateDisplay}
              {" · "}
              {new Date(entry.ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          {canManage && !editing && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="h-6 w-6 rounded inline-flex items-center justify-center text-n500 hover:text-n800 hover:bg-card"
                aria-label="Edit entry"
                title="Edit"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="h-6 w-6 rounded inline-flex items-center justify-center text-n500 hover:text-red-600 hover:bg-card disabled:opacity-50"
                aria-label="Delete entry"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            autoFocus
            className="text-[12.5px] bg-card"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(entry.text);
              }}
              className="h-7 px-2 rounded-md text-[11px] text-n600 hover:bg-card inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!draft.trim() || draft.trim() === entry.text || busy}
              className={cn(
                "h-7 px-2.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1",
                !draft.trim() || draft.trim() === entry.text || busy
                  ? "bg-n200 text-n500 cursor-not-allowed"
                  : "bg-n900 text-white",
              )}
            >
              <Check className="h-3 w-3" /> Save
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[12.5px] text-n800 leading-snug whitespace-pre-wrap">
          {entry.noUpdate ? <span className="italic text-n500">No update</span> : entry.text}
        </p>
      )}

      {entry.nextExpectedAt && !editing && (
        <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-n500">
          <CalendarClock className="h-3 w-3" />
          Next: {new Date(entry.nextExpectedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          {entry.nextExpectedKind && ` · ${entry.nextExpectedKind}`}
        </div>
      )}
    </div>
  );
}
