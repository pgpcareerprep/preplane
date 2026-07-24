/**
 * Adapter: converts the DB-backed `LmpRecord[]` (from `useLmpRows()`, which
 * now reads `public.lmp_processes` directly) into `Process[]` so existing
 * dashboard helpers (statusCounts, domainBreakdown, pocLoad, etc.) work
 * unchanged. The Google Sheets path is no longer in this read flow — writes
 * also go DB-first, with an optional best-effort sheet mirror.
 *
 * Some `Process` fields cannot be derived from `lmp_processes` columns and
 * are inferred or estimated. Those are listed in `UNMAPPABLE_FIELDS` and
 * surfaced in the UI via `<UnmappedFieldsBanner />` for transparency.
 */
import { useMemo } from "react";
import { useLmpRows } from "./hooks";
import type { LmpRecord } from "@/lib/lmpTypes";
import type { Process, ProcessStatus, OfferOutcome, Domain, ProcessType } from "@/lib/lmpProcessQueries";

/** Fields that cannot be accurately mapped from the sheet */
export const UNMAPPABLE_FIELDS = [
  "offerOutcome",
  "mentorAligned",
  "placementProgress",
  "prepProgress",
  "closedReason",
  "r1Names",
  "r2Names",
  "r3Names",
  "finalConvertedNumbers",
  "finalConvertedNames",
] as const;

export type UnmappableField = typeof UNMAPPABLE_FIELDS[number];

/* ── Domain normalization ──
 * Sheet uses short names; Process type uses full names.
 */
const DOMAIN_MAP: Record<string, Domain> = {
  "sales": "Sales",
  "supply chain": "Supply Chain & Operations",
  "supply chain & operations": "Supply Chain & Operations",
  "supply & operations": "Supply Chain & Operations",
  "pm": "Product Management",
  "product management": "Product Management",
  "data": "Data",
  "fo/cos": "FOCOS",
  "focos": "FOCOS",
  "finance": "Finance / PE / VC",
  "finance / pe / vc": "Finance / PE / VC",
  "marketing": "Marketing",
  "consulting": "Consulting",
  "genman": "HR",           // General Management → mapped to HR as closest
  "hr": "HR",
  "mixed": "FOCOS",         // Mixed → closest bucket
  "unmapped": "FOCOS",      // Sentinel for un-categorized rows
  "": "FOCOS",
};


const _warned = new Set<string>();
function normalizeDomain(raw: string): Domain {
  const key = (raw || "").toLowerCase().trim();
  if (!key) return "FOCOS";
  const mapped = DOMAIN_MAP[key];
  if (mapped) return mapped;
  // Pass-through unknown domain instead of silently bucketing as FOCOS.
  // domainBreakdown only counts values in DOMAINS, so unknowns drop out
  // (visible) rather than inflating FOCOS (invisible).
  if (import.meta.env.DEV && !_warned.has(key)) {
    _warned.add(key);
    console.warn(`[useLiveProcesses] Unmapped domain "${raw}" — add to DOMAIN_MAP`);
  }
  return (raw as Domain);
}

/* ── Status mapping ── */
const STATUS_MAP: Record<string, ProcessStatus> = {
  "ongoing": "Ongoing",
  "converted": "Converted",
  "not converted": "Closed",
  "dormant": "Dormant",
  "on hold": "On Hold",
  "converted na": "Converted",
  "closed": "Closed",
  "offer received": "Offer Received",
};

/** Maps DB slugs (and legacy raw strings) → correct human-readable label for display in drill-down tables. */
const DISPLAY_STATUS_MAP: Record<string, string> = {
  "not-started":    "Not Started",
  "prep-ongoing":   "Prep Ongoing",
  "ongoing":        "Prep Ongoing",
  "prep-done":      "Prep Done",
  "hold":           "On Hold",
  "on hold":        "On Hold",
  "converted":      "Converted",
  "offer-received": "Offer Received",
  "offer received": "Offer Received",
  "not-converted":  "Not Converted",
  "not converted":  "Not Converted",
  "other-reasons":  "Other Reasons",
  "other reasons":  "Other Reasons",
  "dormant":        "Dormant",
  "closed":         "Closed",
  "converted-na":   "Converted",
  "converted na":   "Converted",
};

function normalizeStatus(raw: string): ProcessStatus {
  const key = (raw || "").toLowerCase().trim();
  return STATUS_MAP[key] || "Ongoing";
}

/* ── Type mapping ── */
const TYPE_MAP: Record<string, ProcessType> = {
  "full time": "Full-Time",
  "internship": "Internship",
  "live project": "Lateral",        // closest match
  "case competition": "Lateral",    // closest match
};

function normalizeType(raw: string): ProcessType {
  const key = (raw || "").toLowerCase().trim();
  return TYPE_MAP[key] || "Full-Time";
}

/* ── Excel serial date → ISO string ── */
function excelSerialToISO(serial: string): string {
  const n = parseInt(serial, 10);
  if (!n || isNaN(n)) return new Date().toISOString();
  // Excel epoch: Jan 0, 1900 → JS epoch offset
  // Excel serial 1 = Jan 1, 1900; but Excel has a leap year bug for 1900
  const msPerDay = 86400000;
  const excelEpoch = new Date(1899, 11, 30).getTime(); // Dec 30, 1899
  return new Date(excelEpoch + n * msPerDay).toISOString();
}

/** Map an `LmpRecord` into the dashboard `Process` shape. */
export function lmpToProcess(r: LmpRecord): Process {
  const statusRaw = (r as any)._rawStatus || r.status;
  const status = typeof statusRaw === "string" && statusRaw.includes(" ")
    ? normalizeStatus(statusRaw)
    : normalizeStatus(
        r.status === "converted" ? "Converted" :
        r.status === "not-converted" ? "Not Converted" :
        r.status === "closed" ? "Closed" :
        r.status === "dormant" ? "Dormant" :
        r.status === "hold" ? "On Hold" :
        r.status === "ongoing" ? "Ongoing" :
        r.status === "prep-ongoing" ? "Ongoing" :
        r.status === "prep-done" ? "Ongoing" :
        r.status === "other-reasons" ? "Closed" :
        r.status === "not-started" ? "Ongoing" :
        r.status === "converted-na" ? "Converted NA" :
        r.status === "offer-received" ? "Offer Received" :
        "Ongoing"
      );

  const domain = normalizeDomain(r.domain);
  const type = normalizeType((r as any).type || "Full Time");

  // Date handling: createdAt may be an Excel serial number
  const dateCreated = /^\d{5}$/.test(r.createdAt)
    ? excelSerialToISO(r.createdAt)
    : (r.createdAt || new Date().toISOString());

  // ⚠ Offer outcome: INFERRED only — no dedicated column in sheet
  let offerOutcome: OfferOutcome = "";
  let finalConvert = "";
  if (status === "Converted") {
    offerOutcome = "Accepted";
    finalConvert = r.finalConvertedNames || r.company || "";
  } else if (r.status === "not-converted") {
    offerOutcome = "Rejected";
  }

  // ⚠ Placement progress: INFERRED from status — no round tracking data
  let placementProgress: Process["placementProgress"] = "Not Started";
  if (r.prepDoc) placementProgress = "Prep";
  if (r.r1Names) placementProgress = "R1";
  if (r.r2Names) placementProgress = "R2";
  if (r.r3Names) placementProgress = "R3";
  if (status === "Converted") placementProgress = "Converted";

  // ⚠ Prep progress: ESTIMATED percentage
  const progressMap: Record<Process["placementProgress"], number> = {
    "Not Started": 10, Prep: 40, R1: 55, R2: 70, R3: 85, Offer: 95, Converted: 100,
  };

  const lastUpdated = r.lastActivity
    ? (/^\d{5}$/.test(r.lastActivity) ? excelSerialToISO(r.lastActivity) : r.lastActivity)
    : dateCreated;

  const closingDate = r.lastActivity && (status === "Closed" || status === "Converted")
    ? lastUpdated : "";

  const displayStatus = DISPLAY_STATUS_MAP[r.status] ?? DISPLAY_STATUS_MAP[r.status?.toLowerCase()] ?? status;
  const filterStatus = String(statusRaw ?? r.status ?? "").trim().toLowerCase();
  const filterType = String((r as any).type ?? "").trim();
  const filterDomain = String(r.domain ?? "").trim();

  return {
    processId: r.id,
    dateCreated,
    company: r.company,
    role: r.role,
    domain,
    type,
    status,
    offerOutcome,                          // ⚠ UNMAPPABLE — inferred
    prepProgress: progressMap[placementProgress] ?? 10, // ⚠ UNMAPPABLE — estimated
    placementProgress,                     // ⚠ UNMAPPABLE — inferred from status
    r1Shortlisted: r.r1Names || "", // ⚠ ALL EMPTY in current sheet
    r2Shortlisted: r.r2Names || "", // ⚠ ALL EMPTY in current sheet
    r3Shortlisted: r.r3Names || "", // ⚠ ALL EMPTY in current sheet
    finalConvert,                    // ⚠ ALL EMPTY in current sheet
    convertNames: r.finalConvertedNames || "", // ⚠ ALL EMPTY in current sheet
    prepDoc: r.prepDoc ? "Sent" : "",
    mentorAligned: r.mentorAligned ? "Yes" : "No",
    mockDoneByPoc: !!r.mockDoneByPoc,
    nextExpectedProgress: r.nextExpectedProgress || "",
    prepPoc: r.prepPoc?.name || r.domainPrepPoc?.name || "",
    supportPoc: r.supportPoc?.name || "",
    outreachPoc: r.outreachPoc?.name || "",
    lastUpdated,
    closingDate,
    closedReason: "",                      // ⚠ UNMAPPABLE — no column
    lastProgressUpdatedAt: r.lastProgressUpdatedAt || "",
    statusChangedAt: r.statusChangedAt || "",
    checklistUpdatedAt: r.checklistUpdatedAt || "",
    prepDocStatus: r.prepDocStatus,
    displayStatus,
    filterStatus,
    filterType,
    filterDomain,
  };
}

/**
 * Returns live Process[] derived from DB-backed `useLmpRows()`,
 * plus loading/error state from the underlying query.
 */
export function useLiveProcesses(options?: { enabled?: boolean }) {
  const { data: lmpRows = [], isLoading, isError, error } = useLmpRows(options);

  const processes = useMemo(
    () => lmpRows.map(lmpToProcess),
    [lmpRows],
  );

  return { processes, isLoading, isError, error };
}
