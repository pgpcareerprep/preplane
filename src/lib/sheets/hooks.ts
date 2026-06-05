import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sheets } from "./sheetsClient";
import { TABS, getHeaderRow } from "./schema";
import { toast } from "@/hooks/use-toast";
import type { LmpRecord, LmpStatus, Health, LmpPoc } from "@/lib/lmpTypes";
import type { Session, SessionStatus } from "@/lib/session";
import type { AllocationTag, JdMode } from "@/lib/pocAllocation";
import { useLmpProcesses, useLmpProcessById, clearCachePrefix } from "@/lib/hooks/useDbData";
import { supabase } from "@/integrations/supabase/client";

// Canonical sheet ↔ DB column map. Edits go in src/lib/sheets/fieldMap.ts
// (and the Deno mirror at supabase/functions/_shared/fieldMap.ts).
import { SHEET_TO_DB as SHEET_COL_TO_DB, sheetPatchToDbPatch } from "./fieldMap";
import { derivePrepDocLink } from "@/lib/lmp/prepDocLink";
import type { DocumentLink } from "@/components/lmp/bento/DocumentsCard";
export { SHEET_COL_TO_DB };


// Throttle polling to stay under Google Sheets 300 reads/min quota
// With ~5 active queries, 5 min interval = ~1 req/min (safe headroom)

const POLL_INTERVAL = 120_000; // 2 minutes — balance freshness vs 429 rate limits

// ─── Generic sheet list with headerRow support ───

function useSheetList<T = Record<string, string>>(
  tab: string,
  opts?: { headerRow?: number; filter?: (r: Record<string, string>) => boolean; transform?: (r: Record<string, string>) => T }
) {
  return useQuery({
    queryKey: ["sheets", tab],
    queryFn: async () => {
      const result = await sheets.list<Record<string, string>>(tab, opts?.headerRow);
      let rows = result.rows;
      if (opts?.filter) rows = rows.filter(opts.filter);
      return opts?.transform ? rows.map(opts.transform) : (rows as unknown as T[]);
    },
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

// ─── LMP Tracker (operational, bidirectional) ───

type SheetLmpRow = Record<string, string>;

function parseSheetLmp(row: SheetLmpRow): LmpRecord {
  // Map actual sheet columns to LmpRecord fields
  const sourceSheetRow = Number(row.__sheetRowNumber) || undefined;
  const baseId = `${(row["Company"] || "").toLowerCase().replace(/[^a-z0-9]/g, "-")}-${(row["Role"] || "").toLowerCase().replace(/[^a-z0-9]/g, "-")}`.replace(/-+/g, "-").replace(/^-|-$/g, "");
  const statusRaw = (row["Status"] || "").toLowerCase().trim();
  const statusMap: Record<string, LmpStatus> = {
    "not started": "not-started",
    "prep ongoing": "prep-ongoing",
    "prep done": "prep-done",
    "hold": "hold",
    "on hold": "hold",
    "converted": "converted",
    "not converted": "not-converted",
    "not-converted": "not-converted",
    "other reasons": "other-reasons",
    "other-reasons": "other-reasons",
    // Legacy
    "ongoing": "prep-ongoing",
    "dormant": "hold",
    "closed": "not-converted",
    "offer received": "converted",
    "": "not-started",
  };
  const status: LmpStatus = statusMap[statusRaw] || "not-started";

  const makePoc = (name: string, color: string, role: LmpPoc["role"], matchType: LmpPoc["matchType"] = "In-Domain"): LmpPoc => ({
    name: name.trim(),
    initials: name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2),
    color,
    role,
    matchType,
  });

  // Split combined POC cells into individual names
  const splitNames = (raw: string): string[] => {
    if (!raw || !raw.trim()) return [];
    const normalized = raw.replace(/\s+and\s+/gi, "/");
    return normalized.split(/[\/,&+]/).map(s => s.trim()).filter(Boolean);
  };

  const prepNames = splitNames(row["Prep POC"] || "");
  const outreachNames = splitNames(row["Outreach POC"] || "");
  const supportNames: string[] = []; // No Support POC column in sheet

  // Primary = first prep POC name; secondary = rest of prep + explicit support
  const primaryPrepName = prepNames[0] || "";
  const secondaryPrepNames = [...prepNames.slice(1), ...supportNames];

  const prepPocObj = makePoc(primaryPrepName, "bg-orange-200 text-orange-600", "Prep");
  const supportPocFinal = secondaryPrepNames[0] ? makePoc(secondaryPrepNames[0], "bg-purple-200 text-purple-600", "Support") : null;
  const outreachPocFinal = outreachNames[0] ? makePoc(outreachNames[0], "bg-teal-200 text-teal-600", "Outreach", "Outreach POC Assigned") : null;

  const hasOutreach = !!outreachPocFinal;
  const hasSupport = !!supportPocFinal && supportPocFinal.name !== prepPocObj.name;

  const pocs: LmpPoc[] = [prepPocObj];
  const allocationTags: AllocationTag[] = [(prepPocObj.matchType as AllocationTag) || "In-Domain"];
  if (hasSupport) { pocs.push(supportPocFinal!); allocationTags.push("Support POC Suggested"); }
  if (hasOutreach) { pocs.push(outreachPocFinal!); allocationTags.push("Outreach POC Assigned" as AllocationTag); }

  return {
    id: sourceSheetRow ? `${baseId || "lmp"}--row-${sourceSheetRow}` : baseId,
    sourceSheetRow,
    reqId: "",
    role: row["Role"] || "",
    company: row["Company"] || "",
    domain: row["Domain"] || "",
    candidates: (() => {
      const convertNames = (row["Convert\nName(s)"] || "").split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
      const r1Count = parseInt(row["R1\nShortlisted"] || "0") || 0;
      return convertNames.length || r1Count || 0;
    })(),
    stage: "",
    status,
    health: "Healthy" as Health,
    slaDays: 0,
    createdAt: row["Date"] || "",
    lastActivity: row["Closing Date"] || "",
    reason: undefined,
    pocs,
    prepPoc: prepPocObj,
    domainPrepPoc: prepPocObj, // deprecated compat
    supportPoc: hasSupport ? supportPocFinal! : undefined,
    behavioralPrepPoc: hasSupport ? supportPocFinal! : undefined, // deprecated compat
    outreachPoc: hasOutreach ? outreachPocFinal! : undefined,
    allocationTags,
    jdMode: "FULL_SCORING" as JdMode,
    // Additional sheet columns
    type: row["Type"] || "",
    prepProgress: "",
    r1Shortlisted: row["R1\nShortlisted"] || "",
    r2Shortlisted: row["R2\nShortlisted"] || "",
    r3Shortlisted: row["R3\nShortlisted"] || "",
    finalConvert: row["Final\nConvert"] || "",
    convertNames: row["Convert\nName(s)"] || "",
    prepDoc: row["Prep Doc"] || "",
    dailyProgress: row["Daily Progress"] || "",
    // Checklist columns (checkboxes — API returns "false"/"true"/"1"/""
    mentorAligned: ["true", "TRUE", "1", "Mentor Aligned"].includes(row["Mentor Aligned"] ?? ""),
    prepDocShared: ["true", "TRUE", "1"].includes(row["Prep Doc Shared"] ?? ""),
    assignmentReview: ["true", "TRUE", "1"].includes(row["Assignment Review"] ?? ""),
    mockDoneByPoc: ["true", "TRUE", "1"].includes(
      (row["1:1 mock completed"] ?? row["1:1 Mock Completed"] ?? row["Mock (done by POC)"]) ?? ""
    ),
    nextExpectedProgress: row["Next  Expected Progress (Date)"] || "",
    nextExpectedType: row["Next Expected Progress"] || "",
    mentorSelected: row["Mentor Selected"] || "",
    // Documents: Prep Doc column stores either a JSON array [{ label, url }]
    // or a legacy plain URL string. Parse both.
    documents: (() => {
      const raw = row["Prep Doc"] || "";
      if (!raw.trim()) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [{ label: "Document", url: raw }];
      } catch {
        return [{ label: "Document", url: raw }];
      }
    })(),
    // Note: Support POC, Allocator, Admin Owner columns no longer exist in sheet
    allocator: "",
    adminOwner: "",
  };
}

function makePoc(name: string, color: string, role: LmpPoc["role"], matchType: LmpPoc["matchType"] = "In-Domain"): LmpPoc {
  const trimmed = name.trim();
  return {
    name: trimmed,
    initials: trimmed.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2),
    color,
    role,
    matchType,
  };
}

function normalizeStatus(raw: unknown): LmpStatus {
  const key = String(raw ?? "").toLowerCase().trim();
  const statusMap: Record<string, LmpStatus> = {
    // Active sheet values
    "": "not-started",
    "not started": "not-started",
    "not-started": "not-started",
    "prep ongoing": "prep-ongoing",
    "prep-ongoing": "prep-ongoing",
    "prep done": "prep-done",
    "prep-done": "prep-done",
    "on hold": "hold",
    hold: "hold",
    converted: "converted",
    "not converted": "not-converted",
    "not-converted": "not-converted",
    "other reasons": "other-reasons",
    "other-reasons": "other-reasons",
    other: "other-reasons",
    // Legacy → mapped onto the active set
    ongoing: "prep-ongoing",
    dormant: "other-reasons",
    closed: "other-reasons",
    "converted na": "other-reasons",
    "converted-na": "other-reasons",
    "offer received": "converted",
    "offer-received": "converted",
  };
  return statusMap[key] || "not-started";
}

function parseBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  return ["true", "1", "yes"].includes(String(v ?? "").toLowerCase().trim());
}

function dbLmpToRecord(row: Record<string, any>): LmpRecord {
  const baseId = `${row.company || ""}-${row.role || ""}`.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const prepPoc = row.prep_poc ? makePoc(row.prep_poc, "bg-orange-200 text-orange-600", "Prep") : undefined;
  const supportPoc = row.support_poc ? makePoc(row.support_poc, "bg-purple-200 text-purple-600", "Support", "Support POC Suggested") : undefined;
  const outreachPoc = row.outreach_poc ? makePoc(row.outreach_poc, "bg-teal-200 text-teal-600", "Outreach", "Outreach POC Assigned") : undefined;
  const pocs = [prepPoc, supportPoc, outreachPoc].filter(Boolean) as LmpPoc[];
  const parsedSheetRow = row.sheet_row_id != null ? Number(row.sheet_row_id) : NaN;
  const sourceSheetRow = Number.isFinite(parsedSheetRow) && parsedSheetRow > 0 ? parsedSheetRow : undefined;
  return {
    id: row.id || baseId,
    sourceSheetRow,
    reqId: "",
    role: row.role || "",
    company: row.company || "",
    domain: row.domains?.name || row.domain_raw || "",
    candidates: 0,
    stage: row.placement_progress || "",
    status: normalizeStatus(row.status),
    health: "Healthy" as Health,
    slaDays: 0,
    createdAt: row.date || row.created_at || "",
    lastActivity: row.closing_date || row.updated_at || "",
    pocs,
    prepPoc,
    domainPrepPoc: prepPoc,
    supportPoc,
    behavioralPrepPoc: supportPoc,
    outreachPoc,
    allocationTags: pocs.length ? ["In-Domain"] : [],
    jdMode: "FULL_SCORING" as JdMode,
    type: row.type || "",
    prepProgress: row.prep_progress || "",
    r1Shortlisted: row.r1_shortlisted || "",
    r2Shortlisted: row.r2_shortlisted || "",
    r3Shortlisted: row.r3_shortlisted || "",
    finalConvert: row.final_convert || "",
    convertNames: row.convert_names || "",
    prepDoc: row.prep_doc || "",
    dailyProgress: row.daily_progress || "",
    mentorAligned: parseBool(row.mentor_aligned),
    prepDocShared: parseBool(row.prep_doc_shared),
    assignmentReview: parseBool(row.assignment_review),
    mockDoneByPoc: parseBool(row.one_to_one_mock),
    nextExpectedProgress: row.next_progress_date || "",
    nextExpectedType: row.next_progress_type || row.next_progress_reminder_type || "",
    mentorSelected: row.mentor_selected || "",
    mentorRating: row.mentor_rating ?? undefined,
    documents: (() => {
      const raw = row.prep_doc || "";
      if (!String(raw).trim()) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [{ label: "Document", url: raw }];
      } catch {
        return [{ label: "Document", url: raw }];
      }
    })(),
    allocator: row.allocator || "",
    adminOwner: row.admin_owner || "",
    lmpCode: row.lmp_code || "",
    behavioralStatus: row.behavioral_status || "",
    placementProgress: row.placement_progress || "",
    matchTag: row.match_tag || "",
    allocationPath: row.allocation_path || "",
    jdUrl: row.jd_url || "",
    jdLabel: row.jd_label || "",
    closingDate: row.closing_date || "",
    lastProgressUpdatedAt: row.last_progress_updated_at || "",
  };
}

export function useLmpRows() {
  const dbQuery = useLmpProcesses({ includeArchived: true });
  return {
    ...dbQuery,
    data: ((dbQuery.data ?? []) as Record<string, any>[]).map(dbLmpToRecord),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useLmpById(id: string) {
  // Always fetch the row directly by id (when it's a uuid) so newly-created
  // LMPs not yet in the cached list snapshot still resolve.
  const directId = UUID_RE.test(id) ? id : "";
  const directQuery = useLmpProcessById(directId);
  const { data: allRows, isLoading: listLoading } = useLmpRows();
  const fromList = allRows?.find((r) => r.id === id || r.id.toLowerCase() === id?.toLowerCase());
  const fromDirect = directQuery.data ? dbLmpToRecord(directQuery.data as Record<string, any>) : undefined;
  return {
    data: fromDirect ?? fromList,
    isLoading: (directId ? directQuery.isLoading : false) && listLoading,
    isError: directQuery.isError,
    error: directQuery.error,
  };
}

// DB→Sheet mirror flag. Default OFF (Google Sheets integration on hold, 2026-05).
// `sheets.*` calls are no-ops anyway, but flipping the default to false stops
// the mirror code path from running and avoids any side effects (toasts,
// sync_source events) even if the localStorage flag was previously set to true.
const MIRROR_FLAG_KEY = "sheets_mirror_enabled";
function isSheetMirrorEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.localStorage.getItem(MIRROR_FLAG_KEY);
    return v == null ? false : v === "true";
  } catch {
    return false;
  }
}

export function useLmpMutation() {
  const qc = useQueryClient();
  const key = ["sheets", TABS.LMP_TRACKER];
  const hRow = getHeaderRow(TABS.LMP_TRACKER);

  // Checklist columns in the sheet expect human-readable "Yes"/blank,
  // not raw boolean literals. Anything else (dates, text) is passed through.
  const BOOL_SHEET_KEYS = new Set([
    "mentorAligned",
    "prepDocShared",
    "assignmentReview",
    "mockDoneByPoc",
  ]);
  const coerceForSheet = (key: string, value: unknown): unknown => {
    if (BOOL_SHEET_KEYS.has(key) && typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    return value;
  };

  // Reverse-map LmpRecord field names → sheet column names
  const toSheetPatch = (patch: Record<string, unknown>): Record<string, unknown> => {
    const map: Record<string, string> = {
      status: "Status",
      company: "Company",
      role: "Role",
      domain: "Domain",
      createdAt: "Date",
      lastActivity: "Closing Date",
      type: "Type",
      r1Shortlisted: "R1 Shortlisted",
      r2Shortlisted: "R2 Shortlisted",
      r3Shortlisted: "R3 Shortlisted",
      finalConvert: "Converted Names",
      convertNames: "Converted Name(s)",
      prepDoc: "Prep Doc",
      prepDocLink: "Prep Doc Link",
      dailyProgress: "Daily Progress",
      mentorAligned: "Mentor Aligned",
      prepDocShared: "Prep Doc Shared",
      assignmentReview: "Assignment Review",
      mockDoneByPoc: "1:1 mock completed",
      nextExpectedProgress: "Next Progress Date",
      nextExpectedType: "Next Progress Type",
      mentorSelected: "Mentor Selected",
      mentorRating: "Mentor Rating",
      allocator: "Allocator",
      adminOwner: "Admin Owner",
      behavioralStatus: "Behavioral Status",
      matchTag: "Match Tag",
      allocationPath: "Allocation Path",
      closingDate: "Closing Date",
      jdUrl: "JD",
      jdUploadUrl: "JD",
      jdLabel: "JD Label",
    };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if ((k === "prepPoc" || k === "domainPrepPoc") && v && typeof v === "object") {
        out["Prep POC"] = (v as any).name ?? "";
        continue;
      }
      if (k === "documents" && Array.isArray(v)) {
        out["Prep Doc"] = v.length > 0 ? JSON.stringify(v) : "";
        // Mirror the latest "Prep doc shared" checklist link into the
        // dedicated "Prep Doc Link" column (S) so the sheet shows a
        // clickable link, not just JSON. Other document sources (general
        // docs, other checklist items) must not clobber col S.
        out["Prep Doc Link"] = derivePrepDocLink(v as DocumentLink[]) ?? "";
        continue;
      }
      if (k === "supportPoc" && v && typeof v === "object") {
        out["Support POC"] = (v as any).name ?? "";
        continue;
      }
      if (k === "outreachPoc" && v && typeof v === "object") {
        out["Outreach POC"] = (v as any).name ?? "";
        continue;
      }
      const col = map[k];
      if (col) {
        if (k === "status") {
          const reverseStatus: Record<string, string> = {
            "not-started":    "Not Started",
            "prep-ongoing":   "Prep Ongoing",
            "prep-done":      "Prep Done",
            "hold":           "On hold",
            "on-hold":        "On hold",
            "converted":      "Converted",
            "not-converted":  "Not Converted",
            "other-reasons":  "Other reasons",
            // Legacy fallbacks → collapse onto valid sheet labels
            "ongoing":        "Prep Ongoing",
            "dormant":        "On hold",
            "closed":         "Not Converted",
            "offer-received": "Converted",
            "converted-na":   "Not Converted",
          };
          out[col] = reverseStatus[v as string] ?? v;
        } else {
          out[col] = coerceForSheet(k, v);
        }
      } else {
        out[k] = coerceForSheet(k, v);
      }
    }
    return out;
  };

  // Resolve a free-text domain name to a UUID in the `domains` table.
  // Used before insert/update so lmp_processes.domain_id is populated.
  const resolveDomainId = async (raw: unknown): Promise<string | null> => {
    const name = String(raw ?? "").trim();
    if (!name) return null;
    try {
      const { data } = await supabase
        .from("domains")
        .select("id, name")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      return (data as { id?: string } | null)?.id ?? null;
    } catch {
      return null;
    }
  };

  // Build findBy from the original record, never by splitting the slug id.
  const recordForUpdate = (id: string, allRecords?: LmpRecord[]): LmpRecord | undefined => {
    const normalizedId = id.toLowerCase();
    return allRecords?.find((r) => r.id === id || r.id.toLowerCase() === normalizedId);
  };

  // Best-effort fire-and-forget mirror push to the sheet. On failure we log
  // and persist a pending event in `sheet_sync_events` so retry can pick it
  // up — no more silent drift.
  const mirrorToSheet = async (op: "insert" | "update", sheetPatch: Record<string, unknown>, rec?: LmpRecord, dbRecordId?: string) => {
    if (!isSheetMirrorEnabled()) return;
    const fieldList = Object.keys(sheetPatch);
    try {
      if (op === "insert") {
        // Ensure the immutable LMP ID is written into column AA on every new row.
        if (!sheetPatch["LMP ID"] && dbRecordId) {
          try {
            const { data: r } = await supabase
              .from("lmp_processes")
              .select("lmp_code")
              .eq("id", dbRecordId)
              .maybeSingle();
            if (r?.lmp_code) sheetPatch["LMP ID"] = r.lmp_code;
          } catch { /* best-effort */ }
        }
        const result = await sheets.insert(TABS.LMP_TRACKER, sheetPatch, hRow);
        // Persist the sheet row number on the DB row so future updates target
        // the exact sheet row (avoids hitting older duplicate Company+Role rows).
        const newRow = (result as { sheetRowNumber?: number })?.sheetRowNumber;
        if (dbRecordId && Number.isFinite(newRow) && newRow! > 0) {
          try {
            await supabase
              .from("lmp_processes")
              .update({ sheet_row_id: String(newRow) })
              .eq("id", dbRecordId);
          } catch (e) {
            console.warn("[mirrorToSheet] failed to persist sheet_row_id:", e);
          }
        }
      } else if (rec) {
        // Primary sync key: LMP ID (column AA). Never match by Company+Role
        // here — duplicate Company+Role rows would route updates to the wrong
        // process. If lmpCode is missing, surface a clear pending event.
        if (!rec.lmpCode) {
          const message = "LMP_ID_MISSING: cannot mirror update without lmp_code";
          console.warn(`[mirrorToSheet] ${message} for ${rec.company}/${rec.role} (id=${rec.id})`);
          try {
            await supabase.from("sheet_sync_events").insert({
              tab_name: TABS.LMP_TRACKER,
              operation: op,
              direction: "app_to_sheet",
              record_id: rec.id,
              status: "pending",
              fields_synced: fieldList,
              field_count: fieldList.length,
              error_message: message,
            });
          } catch { /* event log best-effort */ }
          toast({
            title: "LMP ID missing",
            description: "Please sync this process before updating. The change was saved to the database but not to the sheet.",
            variant: "destructive",
          });
          return;
        }
        await sheets.update(
          TABS.LMP_TRACKER,
          rec.id,
          sheetPatch,
          hRow,
          { "LMP ID": rec.lmpCode },
          rec.sourceSheetRow,
        );
      } else {
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[mirrorToSheet] ${op} failed for ${rec?.company ?? "?"}/${rec?.role ?? "?"} (lmp_code=${rec?.lmpCode ?? "?"}):`, message);
      // Persist a pending event so retryPendingSheetWrites can replay later.
      try {
        await supabase.from("sheet_sync_events").insert({
          tab_name: TABS.LMP_TRACKER,
          operation: op,
          direction: "app_to_sheet",
          record_id: rec?.id ?? dbRecordId ?? null,
          status: "pending",
          fields_synced: fieldList,
          field_count: fieldList.length,
          error_message: message,
        });
      } catch {
        /* event log is best-effort; don't loop on its own failure */
      }
    }
  };

  // Cross-cutting invalidation: any sheet write must also refresh the DB-side
  // queries (LMP table, mentors, alumni, analytics) so dashboards never display
  // stale numbers after a write.
  const invalidateAll = () => {
    // Wipe the 30s in-memory cache in useDbData so the next refetch isn't
    // served a stale snapshot (otherwise the UI snaps back after optimistic
    // update + invalidate).
    clearCachePrefix('["db-lmp-processes');
    clearCachePrefix('["db-lmp-process"');
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["db-lmp"] });
    qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
    qc.invalidateQueries({ queryKey: ["db-lmp-process"] });
    qc.invalidateQueries({ queryKey: ["db-all-alumni"] });
    qc.invalidateQueries({ queryKey: ["db-mentors"] });
    qc.invalidateQueries({ queryKey: ["db-mentor-stats"] });
    qc.invalidateQueries({ queryKey: ["db-all-mentors"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
    qc.invalidateQueries({ queryKey: ["db-data-source-status"] });
  };

  const insert = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      // DB-first: write to lmp_processes, then best-effort mirror to sheet.
      const sheetPatch = toSheetPatch(row);
      const dbPatch = sheetPatchToDbPatch(sheetPatch);
      // Required columns
      if (!dbPatch.company) dbPatch.company = (row as any).company ?? "";
      if (!dbPatch.role) dbPatch.role = (row as any).role ?? "";
      if (!dbPatch.status) dbPatch.status = "not-started";
      // Resolve free-text Domain → domain_id FK
      if (dbPatch.domain_raw && !dbPatch.domain_id) {
        const domainId = await resolveDomainId(dbPatch.domain_raw);
        if (domainId) dbPatch.domain_id = domainId;
      }
      const { data, error } = await supabase
        .from("lmp_processes")
        .insert({ ...dbPatch, sync_source: "app" } as any)
        .select()
        .single();
      if (error) throw new Error(error.message);
      // Fire-and-forget mirror
      void mirrorToSheet("insert", sheetPatch, undefined, (data as { id?: string } | null)?.id);
      return data;
    },
    onSuccess: () => { invalidateAll(); toast({ title: "LMP record created" }); },
    onError: (e: Error) => { toast({ title: "Create failed", description: e.message, variant: "destructive" }); },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const currentRecords = qc.getQueriesData<Record<string, any>[]>({ queryKey: ["db-lmp-processes"] })
        .flatMap(([, rows]) => (rows ?? []).map(dbLmpToRecord));
      let rec = recordForUpdate(id, currentRecords);
      // Fallback: when the LMP was just created and the react-query cache
      // hasn't picked it up yet, fetch identity from DB so the sheet mirror
      // can still target the correct row instead of silently no-op'ing.
      if (!rec) {
        const { data } = await supabase
          .from("lmp_processes")
          .select("id, company, role, lmp_code, sheet_row_id")
          .eq("id", id)
          .maybeSingle();
        if (data) {
          rec = {
            id: (data as any).id,
            company: (data as any).company,
            role: (data as any).role,
            lmpCode: (data as any).lmp_code,
            sourceSheetRow: Number((data as any).sheet_row_id) || undefined,
          } as LmpRecord;
        }
      }
      const sheetPatch = toSheetPatch(patch);
      const dbPatch = sheetPatchToDbPatch(sheetPatch);

      // "Prep Doc" sheet column ↔ lmp_processes.prep_doc DB column is not in
      // SHEET_HEADER_TO_DB (only Prep Doc Shared / Prep Doc Link are). When the
      // caller patches `documents`, we still need the JSON to land in DB so the
      // checklist modal reads it back after refresh.
      if (patch.documents !== undefined && Array.isArray(patch.documents)) {
        dbPatch.prep_doc = (patch.documents as DocumentLink[]).length > 0
          ? JSON.stringify(patch.documents)
          : "";
      }

      // Resolve free-text Domain edits → domain_id FK so the DB row stays linked.
      if (dbPatch.domain_raw && !dbPatch.domain_id) {
        const domainId = await resolveDomainId(dbPatch.domain_raw);
        if (domainId) dbPatch.domain_id = domainId;
      }

      // DB-first write: ALWAYS target by id (the lmp_processes UUID).
      if (Object.keys(dbPatch).length > 0) {
        const { error } = await supabase
          .from("lmp_processes")
          .update({ ...dbPatch, sync_source: "app" })
          .eq("id", id);
        if (error) throw new Error(error.message);
      }

      // Fire-and-forget mirror push to keep sheet in sync.
      void mirrorToSheet("update", sheetPatch, rec);
      return { db_updated: true } as any;
    },
    onMutate: async ({ id, patch }) => {
      // Route through toSheetPatch first so camelCase record keys
      // (mentorAligned, nextExpectedProgress, …) map to DB columns.
      // Without this, the optimistic patch was a no-op for every field.
      const dbPatch = sheetPatchToDbPatch(toSheetPatch(patch));
      await qc.cancelQueries({ queryKey: ["db-lmp-processes"] });
      await qc.cancelQueries({ queryKey: ["db-lmp-process", id] });
      const snapshots = qc.getQueriesData<any[]>({ queryKey: ["db-lmp-processes"] });
      for (const [k, data] of snapshots) {
        if (!Array.isArray(data)) continue;
        qc.setQueryData(k, data.map((r: any) => (r?.id === id ? { ...r, ...dbPatch } : r)));
      }
      // Also patch the singular detail cache so open detail/drawer views
      // reflect the change instantly (e.g. status pill, daily progress text).
      const singleSnaps = qc.getQueriesData<any>({ queryKey: ["db-lmp-process", id] });
      for (const [k, data] of singleSnaps) {
        if (!data || typeof data !== "object" || Array.isArray(data)) continue;
        qc.setQueryData(k, { ...data, ...dbPatch });
      }
      return { snapshots, singleSnaps };
    },
    onError: (e: Error, _v, ctx: any) => {
      ctx?.snapshots?.forEach(([k, data]: [any, any]) => qc.setQueryData(k, data));
      ctx?.singleSnaps?.forEach(([k, data]: [any, any]) => qc.setQueryData(k, data));
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
    onSettled: () => invalidateAll(),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      // Capture sheet-targeting context BEFORE the DB row is gone.
      let rowNumber: number | undefined;
      let lmpCode = "";
      let company = "";
      let role = "";
      try {
        const { data: row } = await supabase
          .from("lmp_processes")
          .select("company, role, sheet_row_id, lmp_code")
          .eq("id", id)
          .maybeSingle();
        if (row) {
          company = (row as any).company ?? "";
          role = (row as any).role ?? "";
          lmpCode = (row as any).lmp_code ?? "";
          const n = Number((row as any).sheet_row_id);
          if (Number.isFinite(n) && n > 0) rowNumber = n;
        }
      } catch {
        /* best-effort context */
      }

      const { error } = await supabase.from("lmp_processes").delete().eq("id", id);
      if (error) throw new Error(error.message);

      if (isSheetMirrorEnabled() && (rowNumber || lmpCode)) {
        try {
          await sheets.delete(TABS.LMP_TRACKER, id, hRow, {
            rowNumber,
            // Primary sync key: LMP ID. Never fall back to Company+Role —
            // duplicates would delete the wrong row.
            findBy: lmpCode ? { "LMP ID": lmpCode } : undefined,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[del] sheet delete failed for ${company}/${role} (lmp_code=${lmpCode}):`, message);
          try {
            await supabase.from("sheet_sync_events").insert({
              tab_name: TABS.LMP_TRACKER,
              operation: "delete",
              direction: "app_to_sheet",
              record_id: id,
              status: "pending",
              fields_synced: [`LMP ID:${lmpCode || "?"}`, rowNumber ? `Row:${rowNumber}` : "Row:?"],
              field_count: 0,
              error_message: message,
            });
          } catch { /* event log best-effort */ }
          toast({
            title: "Sheet sync pending",
            description: "Record removed from app — will retry sheet delete on next sync.",
          });
        }
      }
      return { deleted: true };
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Record deleted" }); },
    onError: (e: Error) => { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); },
  });

  return { insert, update, delete: del };
}

// ─── Mastersheet (read-only reference, ~1000 students) ───

export type MastersheetStudent = {
  rollNo: string;
  name: string;
  placementStatus: string;
  internship: string;
  liveProject: string;
  primaryDomain: string;
  secondaryDomain: string;
  actualDomain: string;
  otherDomains: string;
  keywords: string;
  mentorPrimary: string;
  mentorSecondary: string;
  mockScore: number;
  resumeScore: number;
  practicum: number;
  behavioral: number;
  behResume: number;
  videoCV: number;
  portfolio: number;
  compositePrimary: number;
  ivAttempts: number;
  interviewRiskFlag: string;
  compositeSecondary: number;
};

function parseMastersheetRow(row: Record<string, string>): MastersheetStudent {
  return {
    rollNo: row["Roll No."] || "",
    name: row["Name"] || "",
    placementStatus: row["Converted Placement Status"] || "",
    internship: row["Internship"] || "",
    liveProject: row["Live Project"] || "",
    primaryDomain: row["Primary Domain"] || "",
    secondaryDomain: row["Secondary Domain"] || "",
    actualDomain: row["Actual Domain"] || "",
    otherDomains: row["Other Suitable Domains"] || "",
    keywords: row["Keywords"] || "",
    mentorPrimary: row["Mentor (Primary)"] || "",
    mentorSecondary: row["Mentor (Secondary)"] || "",
    mockScore: parseFloat(row["Mock Score"]) || 0,
    resumeScore: parseFloat(row["Resume Score"]) || 0,
    practicum: parseFloat(row["Practicum"]) || 0,
    behavioral: parseFloat(row["Behavioral"]) || 0,
    behResume: parseFloat(row["Beh. Resume"]) || 0,
    videoCV: parseFloat(row["Video CV"]) || 0,
    portfolio: parseFloat(row["Portfolio"]) || 0,
    compositePrimary: parseFloat(row["Composite (Primary)"]) || 0,
    ivAttempts: parseInt(row["IV Attempts"]) || 0,
    interviewRiskFlag: row["Interview Risk Flag"] || "",
    compositeSecondary: parseFloat(row["Composite (Secondary)"]) || 0,
  };
}

export function useMastersheet() {
  return useQuery({
    queryKey: ["sheets", TABS.MASTERSHEET],
    queryFn: async () => {
      const result = await sheets.list<Record<string, string>>(TABS.MASTERSHEET, getHeaderRow(TABS.MASTERSHEET));
      return result.rows.map(parseMastersheetRow);
    },
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: false,
    staleTime: 90_000, // Reference data, cache longer
  });
}

// ─── Generic tab reader (for POD, INPUT, and other tabs) ───

export function useSheetTab(tab: string, headerRow?: number) {
  return useQuery({
    queryKey: ["sheets", tab],
    queryFn: async () => {
      const result = await sheets.list(tab, headerRow);
      return result.rows;
    },
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: false,
    staleTime: 90_000,
  });
}

// ─── Sheet metadata ───

export function useSheetMetadata() {
  return useQuery({
    queryKey: ["sheets", "metadata"],
    queryFn: () => sheets.metadata(),
    staleTime: 60_000,
  });
}

// ─── Generic mutation for any writable tab ───

export function useSheetMutation(tab: string) {
  const qc = useQueryClient();
  return {
    insert: useMutation({
      mutationFn: (row: Record<string, unknown>) => sheets.insert(tab, row),
      onSettled: () => qc.invalidateQueries({ queryKey: ["sheets", tab] }),
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
        sheets.update(tab, id, patch),
      onSettled: () => qc.invalidateQueries({ queryKey: ["sheets", tab] }),
    }),
  };
}
