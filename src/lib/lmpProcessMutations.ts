export type LmpProcessStatus =
  | "not-started"
  | "ongoing"
  | "dormant"
  | "hold"
  | "closed"
  | "converted"
  | "not-converted"
  | "converted-na";

import type { AssignmentType, AssignmentReason } from "./pocCapability";
import { classifyAssignment } from "./pocCapability";
import type { AllocationTag, JdMode, ScoreBreakdown } from "./pocAllocation";

/** A POC slot on an LMP process card. */
export type LmpProcessPoc = {
  name: string;
  initials: string;
  color: string;
  /** Match type emitted by the allocation engine. */
  matchType: "In-Domain" | "Cross-Domain" | "High Load Override" | "Manual Override" | "Support POC Suggested" | "Support POC Skipped";
  currentLoad: number;
  maxThreshold: number;
  scoreBreakdown?: ScoreBreakdown | null;
};

export type LmpProcess = {
  id: string;
  company: string;
  role: string;
  domain: string;
  seniority: string;
  status: LmpProcessStatus;
  stage: string;
  /** Prep POC — main owner (auto-assigned by allocation engine). */
  prepPoc?: LmpProcessPoc;
  /** @deprecated Use prepPoc instead */
  domainPrepPoc: LmpProcessPoc;
  /** Support POC — secondary support owner. */
  supportPoc?: LmpProcessPoc;
  /** Outreach POC — outreach coordination. */
  outreachPoc?: LmpProcessPoc;
  /** Whether the latest allocation ran in JD-aware or load-only mode. */
  jdMode: JdMode;
  /** Allocation engine tags (In-Domain, Cross-Domain…). */
  allocationTags: AllocationTag[];
  /** Human-readable explanation of why these POCs were picked. */
  allocationReason: string;
  /**
   * @deprecated Use prepPoc / supportPoc instead.
   * Backward-compat aliases.
   */
  primaryPoc: { name: string; initials: string; color: string };
  /** @deprecated Use supportPoc instead */
  secondaryPoc?: { name: string; initials: string; color: string };
  candidates: number;
  slaDays: number;
  createdAt: string;
  /** Name of the user who created/owns this LMP process. */
  createdBy: string;
  /** Mentor match status for the card. */
  mentorMatch: "completed" | "not-run" | "weak";
  mentorMatchCount?: number;
  /** LMP status for the card. */
  lmp: "open" | "closed" | "none";
  topCandidate?: string;
  /** Was the primary POC inside or outside their capability bucket? */
  assignmentType?: AssignmentType;
  /** Why was this POC chosen? */
  assignmentReason?: AssignmentReason;
  /** File name of the uploaded JD document (PDF or DOCX). Set by POC on the Overview tab. */
  jdFileName?: string;
  /** Raw extracted text content of the JD. Set after parsing on upload. */
  jdText?: string;
  /** Skills extracted from the JD text. Set after parsing. */
  jdSkills?: string[];
  /** Seniority level extracted from the JD. */
  jdSeniority?: string;
  /** ISO timestamp when the JD was uploaded. */
  jdUploadedAt?: string;
};

/**
 * Seed data removed — LMP processes are now sourced exclusively from the live
 * database via `useLiveProcesses()` / `useLmpProcesses()` hooks. The runtime
 * wizard still calls `makeLmpProcess()` to hydrate legacy POC aliases.
 */
type Seed = Omit<LmpProcess, "primaryPoc" | "secondaryPoc"> & { behavioralPrepPoc?: LmpProcessPoc };

/** Hydrate the legacy `primaryPoc` / `secondaryPoc` aliases and set `prepPoc`. */
function hydrateAliases(seed: Seed): LmpProcess {
  const primary = {
    name: seed.domainPrepPoc.name,
    initials: seed.domainPrepPoc.initials,
    color: seed.domainPrepPoc.color,
  };
  const secondary = seed.supportPoc
    ? {
        name: seed.supportPoc.name,
        initials: seed.supportPoc.initials,
        color: seed.supportPoc.color,
      }
    : undefined;
  // Strip behavioralPrepPoc from seed (legacy compat)
  const { behavioralPrepPoc: _, ...rest } = seed as any;
  const hydrated: LmpProcess = { ...rest, prepPoc: seed.domainPrepPoc, primaryPoc: primary, secondaryPoc: secondary };
  if (!hydrated.assignmentType) {
    hydrated.assignmentType = classifyAssignment(hydrated.primaryPoc.name, hydrated.domain);
  }
  if (!hydrated.assignmentReason) {
    hydrated.assignmentReason = hydrated.assignmentType === "cross" ? "load_balance" : "ai_best_fit";
  }
  return hydrated;
}

/** Helper for code that creates new LMP processes at runtime (e.g. wizard). */
export function makeLmpProcess(seed: Seed): LmpProcess {
  return hydrateAliases(seed);
}

export const STATUS_OPTIONS: { value: LmpProcessStatus; label: string }[] = [
  { value: "not-started", label: "Not Started" },
  { value: "ongoing", label: "Ongoing" },
  { value: "dormant", label: "Dormant" },
  { value: "hold", label: "On Hold" },
  { value: "closed", label: "Closed" },
  { value: "converted", label: "Converted" },
  { value: "not-converted", label: "Not Converted" },
  { value: "converted-na", label: "Converted NA" },
];

// Type definitions and default config live in src/types/lmp.ts.
// Re-exported here so consumers can keep a single import path.
export type { Candidate, Round, RemarkEntry } from "@/types/lmp";
export { DEFAULT_ROUNDS, ROUND_TYPES } from "@/types/lmp";

// Roster of available students that can be added to an LMP process.
export type RosterStudent = {
  id: string;
  name: string;
  initials: string;
  color: string;
  program: "TBM" | "YLC";
  cohort: "C7" | "C1";
};

// Backward-compatible type aliases (still imported by several components).
export type Requisition = LmpProcess;
export type ReqStatus = LmpProcessStatus;
export type ReqPoc = LmpProcessPoc;
