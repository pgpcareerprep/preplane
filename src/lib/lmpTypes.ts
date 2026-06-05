import {
  Activity, Moon, PauseCircle, XCircle, Archive,
  CircleDashed, CheckCircle2, MinusCircle, Gift, type LucideIcon,
} from "lucide-react";
import type { AllocationTag, JdMode } from "./pocAllocation";

// Canonical LmpStatus lives in src/types/lmp.ts; re-exported here for legacy importers.
export type { LmpStatus } from "@/types/lmp";
import type { LmpStatus } from "@/types/lmp";
export { STATUSES } from "@/types/lmp";

export type Health = "Healthy" | "Slow" | "Stuck";

export type LmpPoc = {
  name: string;
  initials: string;
  color: string;
  /** POC role on this LMP process. */
  role?: "Prep" | "Support" | "Outreach";
  matchType?: "In-Domain" | "Cross-Domain" | "High Load Override" | "Outreach POC Assigned" | "Recruiter Match" | "Support POC Suggested" | "Manual Override";
};

export type SupportPocSuggestion = {
  poc_name: string;
  reason: string;
  current_active_load: number;
  domain_match: boolean;
  score?: number;
};

export type LmpRecord = {
  id: string;
  sourceSheetRow?: number;
  reqId: string;
  role: string;
  company: string;
  domain: string;
  candidates: number;
  stage: string;
  status: LmpStatus;
  pocs: LmpPoc[];
  /** Prep POC — main owner of LMP preparation (auto-assigned by allocation engine). */
  prepPoc?: LmpPoc;
  /** Support POC — secondary support owner (suggested by system, confirmed by user). */
  supportPoc?: LmpPoc;
  /** Outreach POC — outreach-side coordination (manually assigned). */
  outreachPoc?: LmpPoc;
  /** @deprecated Use prepPoc instead */
  domainPrepPoc?: LmpPoc;
  /** @deprecated Use supportPoc instead */
  behavioralPrepPoc?: LmpPoc;
  // POC source tracking
  prepPocSource?: "auto_allocated" | "manual_override" | null;
  supportPocSource?: "suggested_selected" | "manual_selected" | null;
  supportPocSuggestions?: SupportPocSuggestion[];
  outreachPocSource?: "manual_selected" | null;
  allocationTags?: AllocationTag[];
  jdMode?: JdMode;
  health: Health;
  slaDays: number;
  createdAt: string;
  lastActivity: string;
  reason?: string;
  // Additional sheet columns
  type?: string;
  prepProgress?: string;
  r1Shortlisted?: string;
  r2Shortlisted?: string;
  r3Shortlisted?: string;
  finalConvert?: string;
  convertNames?: string;
  prepDoc?: string;
  dailyProgress?: string;
  // Checklist columns (checkboxes in sheet)
  mentorAligned?: boolean;
  prepDocShared?: boolean;
  assignmentReview?: boolean;
  mockDoneByPoc?: boolean;
  nextExpectedProgress?: string;
  nextExpectedType?: string;
  // Mentor alignment — the selected mentor's name written to sheet column V
  mentorSelected?: string;
  mentorRating?: number;
  // Documents — array of external links (Google Drive etc.) serialized to column R (Prep Doc)
  documents?: Array<{
    id?: string;
    label: string;
    url: string;
    source_type?: "general_document" | "execution_checklist";
    checklist_item_id?: string;
    checklist_item_label?: string;
    created_at?: string;
    updated_at?: string;
  }>;
  // Admin / allocator / process meta (from lmp_processes)
  allocator?: string;
  adminOwner?: string;
  lmpCode?: string;
  behavioralStatus?: string;
  placementProgress?: string;
  matchTag?: string;
  allocationPath?: string;
  jdUrl?: string;
  jdLabel?: string;
  closingDate?: string;
  lastProgressUpdatedAt?: string;
};

// STATUSES re-exported from @/types/lmp at top of file.

export const STATUS_META: Record<LmpStatus, {
  label: string;
  border: string;
  dot: string;
  pill: string;
  icon: LucideIcon;
}> = {
  // ── Active (sheet) statuses ───────────────────────────────────────────────
  "not-started":          { label: "Not Started",         border: "border-l-n400",       dot: "bg-n400",         pill: "pill-not-started",      icon: CircleDashed },
  "prep-ongoing":         { label: "Prep Ongoing",        border: "border-l-green-400",  dot: "bg-green-400",    pill: "pill-ongoing",          icon: Activity },
  "prep-done":            { label: "Prep Done",           border: "border-l-sky-400",    dot: "bg-sky-400",      pill: "pill-prep-done",        icon: CheckCircle2 },
  hold:                   { label: "On hold",             border: "border-l-purple-300", dot: "bg-purple-300",   pill: "pill-hold",             icon: PauseCircle },
  converted:              { label: "Converted",           border: "border-l-orange-300", dot: "bg-orange-300",   pill: "pill-converted",        icon: CheckCircle2 },
  "not-converted":        { label: "Not Converted",       border: "border-l-n300",       dot: "bg-n300",         pill: "pill-not-converted",    icon: XCircle },
  "other-reasons":        { label: "Other reasons",       border: "border-l-slate-400",  dot: "bg-slate-400",    pill: "pill-other-reasons",    icon: MinusCircle },
  // ── Legacy values (kept for backwards compat; not in dropdown) ────────────
  ongoing:                { label: "Prep Ongoing",        border: "border-l-green-400",  dot: "bg-green-400",    pill: "pill-ongoing",          icon: Activity },
  dormant:                { label: "Other reasons",       border: "border-l-slate-400",  dot: "bg-slate-400",    pill: "pill-other-reasons",    icon: Moon },
  closed:                 { label: "Other reasons",       border: "border-l-slate-400",  dot: "bg-slate-400",    pill: "pill-other-reasons",    icon: Archive },
  "converted-na":         { label: "Other reasons",       border: "border-l-slate-400",  dot: "bg-slate-400",    pill: "pill-other-reasons",    icon: MinusCircle },
  "offer-received":       { label: "Converted",           border: "border-l-orange-300", dot: "bg-orange-300",   pill: "pill-converted",        icon: Gift },
};

/**
 * Compute age in days from a date string or Excel serial.
 * Handles both human-readable dates ("Apr 12") and Excel serial numbers ("46147").
 */
export function ageDays(createdAt: string, today: Date = new Date()): number {
  if (!createdAt) return 0;
  // Excel serial number (5-digit integer)
  if (/^\d{5}$/.test(createdAt.trim())) {
    const n = parseInt(createdAt, 10);
    const msPerDay = 86400000;
    const excelEpoch = new Date(1899, 11, 30).getTime();
    const parsed = excelEpoch + n * msPerDay;
    const diff = Math.floor((today.getTime() - parsed) / msPerDay);
    return Math.max(0, diff);
  }
  // ISO date string
  const iso = Date.parse(createdAt);
  if (!Number.isNaN(iso)) {
    const diff = Math.floor((today.getTime() - iso) / 86_400_000);
    return Math.max(0, diff);
  }
  // Short date like "Apr 12"
  const parsed = Date.parse(`${createdAt} ${today.getFullYear()}`);
  if (Number.isNaN(parsed)) return 0;
  const diff = Math.floor((today.getTime() - parsed) / 86_400_000);
  return Math.max(0, diff);
}

export function ageLabel(createdAt: string): string {
  return `${ageDays(createdAt)}d`;
}

export const HEALTH_META: Record<Health, { dot: string; text: string }> = {
  Healthy: { dot: "bg-sage-400",   text: "text-sage-600" },
  Slow:    { dot: "bg-yellow-500", text: "text-yellow-600" },
  Stuck:   { dot: "bg-coral-400",  text: "text-coral-600" },
};

export function slaChip(days: number) {
  if (days < 14) return { cls: "bg-sage-50 text-sage-600 border-sage-200", label: `${days}d` };
  if (days <= 30) return { cls: "bg-yellow-50 text-yellow-600 border-yellow-200", label: `${days}d` };
  return { cls: "bg-coral-50 text-coral-600 border-coral-200", label: `${days}d` };
}

