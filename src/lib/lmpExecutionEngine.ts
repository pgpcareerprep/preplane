import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";

/**
 * LMP execution data: progress entries, comments, checklist, timeline.
 *
 * Persistence model:
 *   - progress  → public.lmp_progress_history
 *   - comments  → public.lmp_remarks
 *   - checklist → public.lmp_checklists  (item completion + note + attachment_meta)
 *   - timeline  → public.lmp_timeline
 *
 * The chip catalogue and per-checklist attachment metadata remain in-memory —
 * no DB columns or storage bucket exist for them yet.
 *
 * Components pass `lmpId`, which may be either a uuid (lmp_processes.id) or a
 * sheet-derived slug like "acme-pm-intern--row-15". Slugs are resolved to
 * uuids via a one-shot cached lookup against lmp_processes.
 */

export type ProgressChip = string;

export type ProgressEntry = {
  id: string;
  lmpId: string;
  ts: number;
  author: string;
  authorInitials: string;
  authorColor: string;
  text: string;
  chips: ProgressChip[];
  noUpdate?: boolean;
  nextExpectedAt?: number;
  nextExpectedKind?: string;
};

export type Comment = {
  id: string;
  lmpId: string;
  ts: number;
  author: string;
  authorInitials: string;
  authorColor: string;
  text: string;
};

export type ChecklistItem = {
  id: string;
  label: string;
  owner?: string;
  done: boolean;
  note?: string;
};

export type TimelineEntryKind =
  | "progress"
  | "no-update"
  | "checklist"
  | "comment"
  | "remark"
  | "candidate-move"
  | "mentor"
  | "attachment"
  | "update";

export type TimelineEntry = {
  id: string;
  lmpId: string;
  ts: number;
  kind: TimelineEntryKind;
  text: string;
  author?: string;
  chips?: string[];
  attachmentName?: string;
  comments?: TimelineComment[];
};

export type TimelineComment = {
  id: string;
  ts: number;
  author: string;
  text: string;
};

export type ChecklistAttachment = { name: string; size: string };

export type ChecklistNote = {
  id: string;
  text: string;
  author: string;
  created_at: string;
  updated_at: string;
};

/* ─────────────────────────────────────────────────────── Constants */

export const DEFAULT_CHIPS: ProgressChip[] = [
  "Candidate Movement",
  "Mentor Alignment",
  "Interview Update",
  "Client Update",
  "Follow-up",
  "Blocker",
  "Prep Progress",
  "Session Update",
  "General Progress",
];

const DEFAULT_CHECKLIST_DEFS: Array<{ id: string; label: string; owner: string }> = [
  { id: "ck1", label: "Prep guide shared", owner: "POC" },
  { id: "ck2", label: "Mentor aligned", owner: "POC" },
  { id: "ck3", label: "Assignment review", owner: "Mentor" },
  { id: "ck4", label: "1:1 mock completed", owner: "Mentor" },
  { id: "ck5", label: "Outreach feedback", owner: "POC" },
];

const ME = {
  name: "You",
  initials: "ME",
  color: "bg-orange-200 text-orange-600",
};

const EMPTY_ARR: any[] = [];

/* ─────────────────────────────────────────────────────── Slug → uuid resolver */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

const uuidCache = new Map<string, string>();
let lookupPromise: Promise<void> | null = null;

function buildLookup(): Promise<void> {
  if (!lookupPromise) {
    lookupPromise = (async () => {
      const { data, error } = await supabase
        .from("lmp_processes")
        .select("id, company, role");
      if (error) {
        // Reset so we retry next time.
        lookupPromise = null;
        return;
      }
      (data ?? []).forEach((r: any) => {
        const slug = `${slugify(r.company || "")}-${slugify(r.role || "")}`
          .replace(/-+/g, "-").replace(/^-|-$/g, "");
        if (slug && r.id) uuidCache.set(slug, r.id);
      });
    })();
  }
  return lookupPromise;
}

async function resolveLmpUuid(idOrSlug: string): Promise<string | null> {
  if (!idOrSlug) return null;
  if (isUuid(idOrSlug)) return idOrSlug;
  const baseSlug = idOrSlug.replace(/--row-\d+$/i, "");
  if (uuidCache.has(baseSlug)) return uuidCache.get(baseSlug)!;
  await buildLookup();
  return uuidCache.get(baseSlug) ?? null;
}

function invalidateForLmp(lmpId: string) {
  queryClient.invalidateQueries({ queryKey: ["exec_progress", lmpId] });
  queryClient.invalidateQueries({ queryKey: ["exec_comments", lmpId] });
  queryClient.invalidateQueries({ queryKey: ["exec_checklist", lmpId] });
  queryClient.invalidateQueries({ queryKey: ["exec_timeline", lmpId] });
  // Legacy hook used by DailyProgressCard
  queryClient.invalidateQueries({ queryKey: ["lmp_progress_history"] });
}

/* ─────────────────────────────────────────────────────── Row mappers */

function rowToProgress(r: any, lmpId: string): ProgressEntry {
  const author = r.author_name || r.created_by || ME.name;
  const meta = r.metadata || {};
  const isNoUpdate = (meta.progress_type || r.progress_type) === "no_update";
  const text = r.text ?? r.progress_text ?? "";
  const chips: string[] = Array.isArray(r.chips) ? r.chips : [];
  const nextDate = meta.next_progress_date ?? r.next_progress_date_snapshot ?? null;
  const nextKind = chips[0] ?? r.reminder_type_snapshot ?? undefined;
  return {
    id: r.id,
    lmpId,
    ts: new Date(r.created_at).getTime(),
    author,
    authorInitials: initialsOf(author),
    authorColor: ME.color,
    text: isNoUpdate ? "No update today" : text,
    chips,
    noUpdate: isNoUpdate,
    nextExpectedAt: nextDate ? new Date(nextDate).getTime() : undefined,
    nextExpectedKind: nextKind,
  };
}

function rowToComment(r: any, lmpId: string): Comment {
  const author = r.author || ME.name;
  return {
    id: r.id,
    lmpId,
    ts: new Date(r.created_at).getTime(),
    author,
    authorInitials: initialsOf(author),
    authorColor: ME.color,
    text: r.content || "",
  };
}

function rowToChecklist(r: any): ChecklistItem {
  const def = DEFAULT_CHECKLIST_DEFS.find((d) => d.id === r.item_key);
  return {
    id: r.item_key,
    label: r.label || def?.label || r.item_key,
    owner: def?.owner,
    done: !!r.completed,
  };
}

function rowToTimeline(r: any, lmpId: string): TimelineEntry {
  const meta = (r.metadata || {}) as Record<string, any>;
  return {
    id: r.id,
    lmpId,
    ts: new Date(r.created_at).getTime(),
    kind: (r.event_type || "progress") as TimelineEntryKind,
    text: r.description || "",
    author: r.actor || undefined,
    chips: Array.isArray(meta.chips) ? meta.chips : undefined,
    attachmentName: meta.attachment_name || undefined,
    comments: Array.isArray(meta.comments) ? meta.comments : undefined,
  };
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "??";
}

/* ─────────────────────────────────────────────────────── In-memory chips & attachments */

const chipsState = { chips: [...DEFAULT_CHIPS] };
const chipListeners = new Set<() => void>();
const emitChips = () => chipListeners.forEach((l) => l());

const attachmentsState: Record<string, Record<string, ChecklistAttachment | undefined>> = {};
const attachmentListeners = new Set<() => void>();
const emitAttachments = () => attachmentListeners.forEach((l) => l());

/* ─────────────────────────────────────────────────────── Hooks */

export function useChips(): ProgressChip[] {
  return useSyncExternalStore(
    (l) => { chipListeners.add(l); return () => { chipListeners.delete(l); }; },
    () => chipsState.chips,
    () => chipsState.chips,
  );
}

export function useProgress(lmpId: string): ProgressEntry[] {
  const { data } = useQuery({
    queryKey: ["exec_progress", lmpId],
    queryFn: async () => {
      const uuid = await resolveLmpUuid(lmpId);
      if (!uuid) return [] as ProgressEntry[];
      const { data, error } = await supabase
        .from("lmp_daily_logs")
        .select("id, lmp_id, text, chips, metadata, author_name, created_at, entry_type")
        .eq("lmp_id", uuid)
        .eq("entry_type", "progress")
        .order("created_at", { ascending: false });
      if (error) return [] as ProgressEntry[];
      return (data ?? []).map((r) => rowToProgress(r, lmpId));
    },
    enabled: !!lmpId,
    staleTime: 15_000,
  });
  return data ?? (EMPTY_ARR as ProgressEntry[]);
}

export function useComments(lmpId: string): Comment[] {
  const { data } = useQuery({
    queryKey: ["exec_comments", lmpId],
    queryFn: async () => {
      const uuid = await resolveLmpUuid(lmpId);
      if (!uuid) return [] as Comment[];
      const { data, error } = await supabase
        .from("lmp_timeline")
        .select("id,description,actor,created_at,metadata")
        .eq("lmp_id", uuid)
        .eq("event_type", "remark")
        .order("created_at", { ascending: false });
      if (error) return [] as Comment[];
      return (data ?? []).map((r: any) =>
        rowToComment(
          { id: r.id, content: r.description, author: r.actor, created_at: r.created_at },
          lmpId,
        ),
      );
    },
    enabled: !!lmpId,
    staleTime: 15_000,
  });
  return data ?? (EMPTY_ARR as Comment[]);
}

// `useChecklist` was removed: checklist state now lives on `lmp_processes`
// boolean columns (mentor_aligned, prep_doc_shared, assignment_review,
// one_to_one_mock) and is read/written via `useLmpMutation`. The old
// `lmp_timeline`-backed reader caused two divergent sources of truth.

export function useTimeline(lmpId: string): TimelineEntry[] {
  const { data } = useQuery({
    queryKey: ["exec_timeline", lmpId],
    queryFn: async () => {
      const uuid = await resolveLmpUuid(lmpId);
      if (!uuid) return [] as TimelineEntry[];
      const { data, error } = await supabase
        .from("lmp_timeline")
        .select("*")
        .eq("lmp_id", uuid)
        .order("created_at", { ascending: false });
      if (error) return [] as TimelineEntry[];
      return (data ?? []).map((r) => rowToTimeline(r, lmpId));
    },
    enabled: !!lmpId,
    staleTime: 15_000,
  });
  return data ?? (EMPTY_ARR as TimelineEntry[]);
}

export function useChecklistAttachment(lmpId: string, itemId: string): ChecklistAttachment | undefined {
  // Hydrate from lmp_checklists.attachment_meta on mount so attachments survive refresh.
  useQuery({
    queryKey: ["checklist_attachment", lmpId, itemId],
    queryFn: async () => {
      const uuid = await resolveLmpUuid(lmpId);
      if (!uuid) return null;
      const { data } = await supabase
        .from("lmp_checklists")
        .select("attachment_meta")
        .eq("lmp_id", uuid)
        .eq("item_key", itemId)
        .maybeSingle();
      const meta = (data as { attachment_meta?: unknown })?.attachment_meta;
      if (Array.isArray(meta) && meta.length > 0) {
        const last = meta[meta.length - 1] as { name?: string; size?: string };
        if (last?.name) {
          if (!attachmentsState[lmpId]) attachmentsState[lmpId] = {};
          attachmentsState[lmpId][itemId] = { name: last.name, size: last.size ?? "" };
          emitAttachments();
        }
      }
      return meta ?? null;
    },
    enabled: !!lmpId && !!itemId,
    staleTime: 30_000,
  });
  return useSyncExternalStore(
    (l) => { attachmentListeners.add(l); return () => { attachmentListeners.delete(l); }; },
    () => attachmentsState[lmpId]?.[itemId],
    () => attachmentsState[lmpId]?.[itemId],
  );
}

/* ─────────────────────────────────────────────────────── Mutations */

async function pushTimeline(
  uuid: string,
  lmpId: string,
  entry: { kind: TimelineEntryKind; text: string; author?: string; metadata?: Record<string, any> },
) {
  await supabase.from("lmp_timeline").insert({
    lmp_id: uuid,
    event_type: entry.kind,
    description: entry.text,
    actor: entry.author ?? ME.name,
    metadata: entry.metadata ?? {},
  });
}

export async function addProgress(
  lmpId: string,
  text: string,
  chips: ProgressChip[],
  nextExpectedAt?: number,
  nextExpectedKind?: string,
): Promise<void> {
  const uuid = await resolveLmpUuid(lmpId);
  if (!uuid) {
    console.warn("[lmpExecution] addProgress: no uuid for", lmpId);
    return;
  }
  await supabase.from("lmp_daily_logs").insert({
    lmp_id: uuid,
    entry_type: "progress",
    text,
    author_name: ME.name,
    chips: nextExpectedKind ? [nextExpectedKind, ...chips] : chips,
    metadata: {
      progress_type: "progress_update",
      next_progress_date: nextExpectedAt
        ? new Date(nextExpectedAt).toISOString().slice(0, 10)
        : null,
      source: "ui",
    },
  });
  // Timeline is auto-logged by AFTER INSERT trigger on lmp_daily_logs.
  invalidateForLmp(lmpId);
}

export async function markNoUpdate(lmpId: string): Promise<void> {
  const uuid = await resolveLmpUuid(lmpId);
  if (!uuid) return;
  await supabase.from("lmp_daily_logs").insert({
    lmp_id: uuid,
    entry_type: "progress",
    text: "No update today",
    author_name: ME.name,
    chips: [],
    metadata: { progress_type: "no_update", source: "ui" },
  });
  // Timeline is auto-logged by AFTER INSERT trigger on lmp_daily_logs.
  invalidateForLmp(lmpId);
}

export function addChip(chip: string): void {
  const trimmed = chip.trim();
  if (!trimmed || chipsState.chips.includes(trimmed)) return;
  chipsState.chips = [...chipsState.chips, trimmed];
  emitChips();
}

// `toggleChecklist` was removed: see comment above `useChecklist`.

export async function setChecklistNote(lmpId: string, itemId: string, note: string): Promise<void> {
  const uuid = await resolveLmpUuid(lmpId);
  if (!uuid) return;
  const def = DEFAULT_CHECKLIST_DEFS.find((d) => d.id === itemId);
  const trimmed = note.trim();
  // Persist on lmp_checklists (upsert on lmp_id + item_key). Store null when cleared.
  const { error } = await supabase
    .from("lmp_checklists")
    .upsert(
      { lmp_id: uuid, item_key: itemId, note: trimmed || null },
      { onConflict: "lmp_id,item_key" },
    );
  if (error) console.warn("[setChecklistNote] persist failed:", error);
  if (trimmed) {
    await pushTimeline(uuid, lmpId, {
      kind: "checklist",
      text: `Note on "${def?.label || itemId}": ${trimmed}`,
      author: ME.name,
    });
  }
  invalidateForLmp(lmpId);
}

/* ─────────────────────────────────────────────────────── Multi-note management */

function normalizeNotes(raw: unknown, legacyNote?: string | null): ChecklistNote[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: ChecklistNote[] = arr
    .filter((n): n is Record<string, unknown> => !!n && typeof n === "object")
    .map((n) => ({
      id: String((n as any).id ?? crypto.randomUUID()),
      text: String((n as any).text ?? ""),
      author: String((n as any).author ?? ME.name),
      created_at: String((n as any).created_at ?? new Date().toISOString()),
      updated_at: String((n as any).updated_at ?? (n as any).created_at ?? new Date().toISOString()),
    }))
    .filter((n) => n.text.trim().length > 0);
  if (out.length === 0 && legacyNote && legacyNote.trim()) {
    out.push({
      id: "legacy",
      text: legacyNote.trim(),
      author: ME.name,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    });
  }
  return out;
}

function invalidateNotes(lmpId: string, itemId: string) {
  queryClient.invalidateQueries({ queryKey: ["checklist_notes", lmpId, itemId] });
  queryClient.invalidateQueries({ queryKey: ["exec_timeline", lmpId] });
}

async function fetchNotesRow(uuid: string, itemId: string) {
  const { data } = await supabase
    .from("lmp_checklists")
    .select("notes_meta, note")
    .eq("lmp_id", uuid)
    .eq("item_key", itemId)
    .maybeSingle();
  return data as { notes_meta?: unknown; note?: string | null } | null;
}

export function useChecklistNotes(lmpId: string, itemId: string): ChecklistNote[] {
  const { data } = useQuery({
    queryKey: ["checklist_notes", lmpId, itemId],
    queryFn: async () => {
      const uuid = await resolveLmpUuid(lmpId);
      if (!uuid) return [] as ChecklistNote[];
      const row = await fetchNotesRow(uuid, itemId);
      return normalizeNotes(row?.notes_meta, row?.note);
    },
    enabled: !!lmpId && !!itemId,
    staleTime: 15_000,
  });
  return data ?? (EMPTY_ARR as ChecklistNote[]);
}

async function writeNotes(
  lmpId: string,
  itemId: string,
  mutate: (current: ChecklistNote[]) => ChecklistNote[],
  timelineText?: string,
): Promise<void> {
  const uuid = await resolveLmpUuid(lmpId);
  if (!uuid) return;
  const row = await fetchNotesRow(uuid, itemId);
  const current = normalizeNotes(row?.notes_meta, row?.note);
  const next = mutate(current).map((n) => ({ ...n, text: n.text.trim() })).filter((n) => n.text);
  const { error } = await supabase
    .from("lmp_checklists")
    .upsert(
      { lmp_id: uuid, item_key: itemId, notes_meta: next as unknown as never },
      { onConflict: "lmp_id,item_key" },
    );
  if (error) console.warn("[checklistNotes] persist failed:", error);
  if (timelineText) {
    await pushTimeline(uuid, lmpId, { kind: "checklist", text: timelineText, author: ME.name });
  }
  invalidateNotes(lmpId, itemId);
}

export async function addChecklistNote(
  lmpId: string,
  itemId: string,
  itemLabel: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const now = new Date().toISOString();
  const note: ChecklistNote = {
    id: crypto.randomUUID(),
    text: trimmed,
    author: ME.name,
    created_at: now,
    updated_at: now,
  };
  await writeNotes(
    lmpId,
    itemId,
    (cur) => [...cur.filter((n) => n.id !== "legacy" || cur.length > 0).map((n) => (n.id === "legacy" ? { ...n, id: crypto.randomUUID() } : n)), note],
    `Added note on "${itemLabel}": ${trimmed}`,
  );
}

export async function updateChecklistNote(
  lmpId: string,
  itemId: string,
  itemLabel: string,
  noteId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await writeNotes(
    lmpId,
    itemId,
    (cur) =>
      cur.map((n) =>
        n.id === noteId
          ? { ...n, id: noteId === "legacy" ? crypto.randomUUID() : n.id, text: trimmed, updated_at: new Date().toISOString() }
          : n,
      ),
    `Edited note on "${itemLabel}": ${trimmed}`,
  );
}

export async function deleteChecklistNote(
  lmpId: string,
  itemId: string,
  itemLabel: string,
  noteId: string,
): Promise<void> {
  await writeNotes(
    lmpId,
    itemId,
    (cur) => cur.filter((n) => n.id !== noteId),
    `Deleted a note on "${itemLabel}"`,
  );
}

export async function attachToChecklist(
  lmpId: string,
  itemId: string,
  file: ChecklistAttachment,
): Promise<void> {
  // Mirror in-memory state for immediate UI feedback.
  if (!attachmentsState[lmpId]) attachmentsState[lmpId] = {};
  attachmentsState[lmpId][itemId] = file;
  emitAttachments();
  const uuid = await resolveLmpUuid(lmpId);
  if (!uuid) return;
  const def = DEFAULT_CHECKLIST_DEFS.find((d) => d.id === itemId);
  // Persist attachment metadata to lmp_checklists.attachment_meta (array of files).
  // Read-modify-write so multiple uploads accumulate per checklist item.
  const { data: existing } = await supabase
    .from("lmp_checklists")
    .select("attachment_meta")
    .eq("lmp_id", uuid)
    .eq("item_key", itemId)
    .maybeSingle();
  const prev = Array.isArray((existing as { attachment_meta?: unknown })?.attachment_meta)
    ? ((existing as { attachment_meta: unknown[] }).attachment_meta as Array<Record<string, unknown>>)
    : [];
  const nextMeta = [
    ...prev,
    { name: file.name, size: file.size, uploaded_at: new Date().toISOString(), uploaded_by: ME.name },
  ];
  const { error } = await supabase
    .from("lmp_checklists")
    .upsert(
      { lmp_id: uuid, item_key: itemId, attachment_meta: nextMeta as unknown as never },
      { onConflict: "lmp_id,item_key" },
    );
  if (error) console.warn("[attachToChecklist] persist failed:", error);
  await pushTimeline(uuid, lmpId, {
    kind: "attachment",
    text: `Attached "${file.name}"${def ? ` to "${def.label}"` : ""}`,
    author: ME.name,
    metadata: { attachment_name: file.name, item_key: itemId },
  });
  invalidateForLmp(lmpId);
}

export async function logCandidateMove(
  lmpId: string,
  candidateName: string,
  fromRound: string,
  toRound: string,
): Promise<void> {
  const uuid = await resolveLmpUuid(lmpId);
  if (!uuid) return;
  await pushTimeline(uuid, lmpId, {
    kind: "candidate-move",
    text: `${candidateName} moved ${fromRound} → ${toRound}`,
    author: ME.name,
  });
  invalidateForLmp(lmpId);
}

export async function addComment(lmpId: string, text: string): Promise<void> {
  const uuid = await resolveLmpUuid(lmpId);
  if (!uuid) return;
  await pushTimeline(uuid, lmpId, {
    kind: "remark",
    text,
    author: ME.name,
  });
  invalidateForLmp(lmpId);
}

export async function addTimelineComment(lmpId: string, entryId: string, text: string): Promise<void> {
  const uuid = await resolveLmpUuid(lmpId);
  if (!uuid) return;
  // Append to the existing timeline row's metadata.comments array
  const { data: row } = await supabase
    .from("lmp_timeline")
    .select("metadata")
    .eq("id", entryId)
    .maybeSingle();
  const meta = (row?.metadata || {}) as Record<string, any>;
  const comments = Array.isArray(meta.comments) ? meta.comments : [];
  comments.push({
    id: `tc-${Date.now()}`,
    ts: Date.now(),
    author: ME.name,
    text: text.trim(),
  });
  await supabase
    .from("lmp_timeline")
    .update({ metadata: { ...meta, comments } })
    .eq("id", entryId);
  invalidateForLmp(lmpId);
}

/* ─────────────────────────────────────────────────────── Helpers */

export function isToday(ts: number, now: Date = new Date()): boolean {
  const d = new Date(ts);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function hasUpdateToday(entries: ProgressEntry[]): boolean {
  return entries.some((e) => isToday(e.ts));
}

export function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
