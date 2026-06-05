import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, MinusCircle, CalendarClock, History, ChevronDown, FileSpreadsheet, AlertTriangle, Mail, Pencil, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/rolesContext";
import { format, isAfter, isBefore, isToday as isDateToday, parseISO } from "date-fns";
import {
  addProgress,
  hasUpdateToday,
  markNoUpdate,
  useProgress,
  formatRelativeTime,
} from "@/lib/lmpExecutionEngine";
import { parseDailyProgress, type ProgressTimelineEntry } from "@/lib/dateParser";
import { cn } from "@/lib/utils";
import {
  useProgressHistory,
  useAddProgressEntry,
  useSaveNextProgressDate,
  useUpdateLastProgressAt,
  useUpdateProgressEntry,
  useDeleteProgressEntry,
  type ProgressHistoryEntry,
} from "@/lib/hooks/useProgressHistory";
import { Textarea } from "@/components/ui/textarea";

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
  source: "local" | "sheet" | "db";
  noUpdate?: boolean;
  editedAt?: string | null;
  nextExpectedAt?: number;
  nextExpectedKind?: string;
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
  const localEntries = useProgress(lmpId);
  const noUpdateNeeded = !hasUpdateToday(localEntries);

  // DB-backed progress history
  const { data: dbHistory = [] } = useProgressHistory(lmpId);
  const addProgressEntry = useAddProgressEntry();
  const saveNextDate = useSaveNextProgressDate();
  const updateLastProgress = useUpdateLastProgressAt();

  const [text, setText] = useState("");
  const [nextDate, setNextDate] = useState<string>(nextProgressDateFromDb || "");
  const normalizeReminderType = (v?: string | null): string => {
    const s = (v || "").trim();
    if (!s) return "Follow - Up";
    if (s === "Follow-up" || s === "Follow-Up" || s === "Follow up") return "Follow - Up";
    if (s === "Movement" || s === "Moved to Next Round") return "Moved to next round";
    return s;
  };
  const [nextKind, setNextKind] = useState<string>(normalizeReminderType(reminderTypeFromDb));
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
  }, [nextProgressDateFromDb]);
  useEffect(() => {
    const norm = normalizeReminderType(reminderTypeFromDb);
    if (reminderTypeFromDb && norm !== nextKind) setNextKind(norm);
  }, [reminderTypeFromDb]);

  // Sheets → DB ingest is disabled. DB is the source of truth — daily
  // progress is read from `lmp_daily_logs` via `useProgressHistory`.
  const qc = useQueryClient();
  void qc;

  // Parse sheet daily progress
  const sheetEntries = useMemo<ProgressTimelineEntry[]>(
    () => parseDailyProgress(sheetDailyProgress || ""),
    [sheetDailyProgress],
  );

  // Merge sheet + DB entries into unified timeline.
  // NOTE: `localEntries` (from useProgress) reads the SAME lmp_daily_logs rows
  // that `dbHistory` reads. Including both produced duplicate rows. DB is the
  // canonical source — local store is intentionally dropped from the merge.
  void localEntries;
  const mergedEntries = useMemo<MergedEntry[]>(() => {
    // Local-date (not UTC) so late-evening IST entries don't shift to previous day.
    const toLocalDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    // Aggressive normalizer for fuzzy matching: lowercase, alphanumeric only.
    const fp = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const shiftDate = (date: string, days: number) => {
      const d = new Date(date + "T00:00:00");
      d.setDate(d.getDate() + days);
      return toLocalDate(d);
    };

    const sheet: MergedEntry[] = sheetEntries.map((e, i) => ({
      id: `sheet-${i}`,
      ts: new Date(e.date).getTime(),
      date: e.date,
      dateDisplay: e.dateDisplay,
      text: e.text,
      author: "Sheet",
      source: "sheet" as const,
    }));
    const db: MergedEntry[] = dbHistory.map((e) => {
      const d = new Date(e.created_at);
      return {
        id: e.id,
        ts: d.getTime(),
        date: toLocalDate(d),
        dateDisplay: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        text: e.progress_type === "no_update" ? "No update" : e.progress_text,
        author: e.created_by || "POC",
        authorEmail: e.author_email,
        source: "db" as const,
        noUpdate: e.progress_type === "no_update",
        editedAt: e.edited_at,
      };
    });

    // De-dup DB rows by date + normalized text.
    const dbSeen = new Set<string>();
    const dbDedup: MergedEntry[] = [];
    // Index DB fingerprints by date for sheet-vs-DB suppression.
    const dbByDate = new Map<string, string[]>();
    for (const e of db) {
      const f = fp(e.text);
      const k = `${e.date}|${f}`;
      if (dbSeen.has(k)) continue;
      dbSeen.add(k);
      dbDedup.push(e);
      if (f) {
        const arr = dbByDate.get(e.date) ?? [];
        arr.push(f);
        dbByDate.set(e.date, arr);
      }
    }

    // Drop sheet rows already represented in DB (same date or ±1 day, exact or substring fingerprint).
    const filteredSheet = sheet.filter((s) => {
      const sf = fp(s.text);
      if (!sf) return true;
      const candidates = [
        ...(dbByDate.get(s.date) ?? []),
        ...(dbByDate.get(shiftDate(s.date, -1)) ?? []),
        ...(dbByDate.get(shiftDate(s.date, 1)) ?? []),
      ];
      for (const df of candidates) {
        if (df === sf) return false;
        if (sf.length >= 4 && (df.includes(sf) || sf.includes(df))) return false;
      }
      return true;
    });

    return [...dbDedup, ...filteredSheet].sort((a, b) => b.ts - a.ts);
  }, [localEntries, sheetEntries, dbHistory]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, MergedEntry[]> = {};
    for (const e of mergedEntries) {
      (groups[e.date] ??= []).push(e);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [mergedEntries]);

  const totalCount = mergedEntries.length;
  const sheetCount = sheetEntries.length;

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

  const submit = () => {
    if (!text.trim()) return;

    // Sheet mirror via parent (writes to lmp_processes.daily_progress + sheet)
    onSaveProgress?.(text.trim());

    // Single DB insert into lmp_daily_logs (was double-inserting via addProgress + this hook)
    addProgressEntry.mutate({
      lmpId,
      progressText: text.trim(),
      progressType: "progress_update",
      createdBy: currentAuthorLabel,
      nextProgressDateSnapshot: nextDate || null,
      reminderTypeSnapshot: nextKind,
    });

    updateLastProgress.mutate(lmpId);

    if (nextDate) {
      saveNextDate.mutate({ lmpId, nextDate, reminderType: nextKind, pocEmail: pocEmail || undefined });
    }

    setText("");
  };

  const handleMarkNoUpdate = () => {
    // Single DB insert (no local-store duplicate)
    addProgressEntry.mutate({
      lmpId,
      progressText: "No update marked for today",
      progressType: "no_update",
      createdBy: currentAuthorLabel,
      nextProgressDateSnapshot: nextDate || null,
      reminderTypeSnapshot: nextKind,
    });
  };

  const clearNudge = () => {
    setNextDate("");
    saveNextDate.mutate({ lmpId, nextDate: null, reminderType: nextKind, pocEmail: pocEmail || undefined, skipReminder: true });
    onSaveNextDate?.("", nextKind, false);
    toast.success("Nudge cleared");
  };

  if (mode === "summary") {
    const latest = mergedEntries[0];
    const nextEntry = mergedEntries.find((e) => e.nextExpectedAt);
    return (
      <div className="rounded-2xl bg-n50/40 border border-n200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[13px] font-semibold text-n800">Daily Progress</h4>
          {latest ? (
            <div className="flex items-center gap-1.5">
              {latest.source === "sheet" && <FileSpreadsheet className="h-3 w-3 text-emerald-500" />}
              <span className="text-[10.5px] text-n500">
                {latest.source === "local" ? formatRelativeTime(latest.ts) : latest.dateDisplay}
              </span>
            </div>
          ) : (
            <span className="text-[10.5px] text-n400 italic">No updates yet</span>
          )}
        </div>
        {latest ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] text-n500">
              <span className="tabular-nums">{latest.dateDisplay}</span>
              <span className="text-n300">·</span>
              <span className="font-medium text-n700">{latest.author}</span>
              {latest.source === "sheet" && (
                <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-200 rounded px-1 py-[1px]">Sheet</span>
              )}
              {latest.source === "db" && (
                <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1 py-[1px]">DB</span>
              )}
            </div>
            <p className="text-[12.5px] text-n800 leading-snug line-clamp-2">"{latest.text}"</p>
          </div>
        ) : (
          <p className="text-[12.5px] text-n500 italic">No progress logged yet.</p>
        )}
        {sheetCount > 0 && (
          <div className="mt-2 text-[10.5px] text-emerald-600 flex items-center gap-1">
            <FileSpreadsheet className="h-3 w-3" />
            {sheetCount} entries imported from sheet
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
              <span className="text-n500"> · {nextKind}</span>
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
            disabled={!text.trim()}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-n900 text-white text-[11.5px] font-medium hover:bg-n800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" /> Save
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
                onSaveNextDate?.(newDate, nextKind, sendConfirmation);
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
            <option>Follow - Up</option>
            <option>Interview</option>
            <option>Feedback</option>
            <option>Mentor Session</option>
            <option>Moved to next round</option>
            <option>Other</option>
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
            groupedByDate.map(([date, dateEntries]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="h-px flex-1 bg-n200" />
                  <span className="text-[10.5px] font-semibold text-n500 tabular-nums tracking-wide uppercase">
                    {dateEntries[0].dateDisplay}
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
                          (!!user?.email &&
                            !!entry.authorEmail &&
                            user.email.toLowerCase() === entry.authorEmail.toLowerCase()) ||
                          (!!user?.name && entry.author === user.name))
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
        onError: () => toast.error("Couldn't update entry"),
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
        onError: () => toast.error("Couldn't delete entry"),
      },
    );
  };

  return (
    <div
      className={cn(
        "group rounded-lg border p-3",
        entry.source === "sheet"
          ? "border-emerald-200 bg-emerald-50/40"
          : entry.source === "db"
          ? "border-blue-200 bg-blue-50/30"
          : entry.noUpdate
          ? "border-n200 bg-n50/50"
          : "border-n200 bg-card",
      )}
    >
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12px] font-medium text-n700 truncate">{entry.author}</span>
          {entry.source === "sheet" && (
            <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-200 rounded px-1.5 py-[1px] font-medium">
              From Sheet
            </span>
          )}
          {entry.source === "db" && (
            <span className="text-[9px] bg-blue-100 text-blue-700 border border-blue-200 rounded px-1.5 py-[1px] font-medium">
              Saved
            </span>
          )}
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
          <span className="text-[10.5px] text-n400 tabular-nums">
            {entry.dateDisplay}
            {(entry.source === "local" || entry.source === "db") && (
              <>
                {" · "}
                {new Date(entry.ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </>
            )}
          </span>
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
