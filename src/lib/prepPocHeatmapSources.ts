/**
 * Shared heatmap data-source helpers: assignment merge, domain resolution,
 * placed-student detection, and student effective status.
 */

import { isEligiblePrepPocProfile, type PocProfileLike } from "@/lib/prepPocEligibility";
import { resolveStageToRoundId } from "@/lib/pipelineStage";
import type {
  CandidateRaw,
  LinkRaw,
  LmpProcessForHeatmap,
  PocRaw,
  StatusBucket,
} from "@/lib/prepPocHeatmapAgg";

const norm = (s: unknown): string => String(s ?? "").trim().toLowerCase();

export type LmpProcessAssignmentRow = LmpProcessForHeatmap & {
  id: string;
  prep_poc_id?: string | null;
  support_poc_id?: string | null;
  final_converted_names?: string | null;
};

export type HeatmapSessionRaw = {
  lmp_id: string | null;
  student_id: string | null;
  status: string | null;
  completed_at: string | null;
};

/** True when the candidate appears in the LMP pipeline Converted column. */
export function isCandidateInConvertedPipeline(candidate: CandidateRaw | null | undefined): boolean {
  if (!candidate) return false;
  return resolveStageToRoundId(candidate.pipeline_stage) === "converted";
}

export function resolveLmpDomainFields(
  process: LmpProcessForHeatmap | null | undefined,
): { normKey: string; display: string; domainId: string | null } {
  const display = String(process?.domains?.name ?? process?.domain_raw ?? "").trim();
  const normKey = norm(display);
  return {
    normKey,
    display,
    domainId: process?.domain_id ?? (normKey || null),
  };
}

function linkKey(pocId: string, lmpId: string, role: string): string {
  return `${pocId}:${lmpId}:${role}`;
}

function toHeatmapProcess(row: LmpProcessAssignmentRow): LmpProcessForHeatmap {
  return {
    id: row.id,
    lmp_code: row.lmp_code,
    company: row.company,
    role: row.role,
    status: row.status,
    domain_id: row.domain_id,
    domain_raw: row.domain_raw,
    daily_progress: row.daily_progress,
    created_at: row.created_at,
    updated_at: row.updated_at,
    domains: row.domains,
    final_converted_names: row.final_converted_names,
    prep_poc_id: row.prep_poc_id,
    support_poc_id: row.support_poc_id,
  };
}

/** Merge lmp_poc_links with prep_poc_id / support_poc_id on lmp_processes. */
export function mergeHeatmapAssignmentLinks(
  tableLinks: LinkRaw[],
  processes: LmpProcessAssignmentRow[],
): LinkRaw[] {
  const existing = new Set(tableLinks.map((l) => linkKey(l.poc_id, l.lmp_id, l.role)));
  const processById = new Map(processes.map((p) => [p.id, p]));
  const merged: LinkRaw[] = tableLinks.map((l) => {
    const fromProcess = processById.get(l.lmp_id);
    return {
      ...l,
      lmp_processes: fromProcess ? toHeatmapProcess(fromProcess) : l.lmp_processes,
    };
  });

  for (const proc of processes) {
    const lmpProcess = toHeatmapProcess(proc);
    const pairs: Array<{ pocId: string | null | undefined; role: "prep" | "support" }> = [
      { pocId: proc.prep_poc_id, role: "prep" },
      { pocId: proc.support_poc_id, role: "support" },
    ];
    for (const { pocId, role } of pairs) {
      if (!pocId) continue;
      const key = linkKey(pocId, proc.id, role);
      if (existing.has(key)) continue;
      existing.add(key);
      merged.push({
        poc_id: pocId,
        role,
        lmp_id: proc.id,
        lmp_processes: lmpProcess,
      });
    }
  }

  return merged;
}

export function filterEligibleHeatmapPocs(pocs: PocRaw[], links: LinkRaw[]): PocRaw[] {
  const assignmentPocIds = new Set(links.map((l) => l.poc_id));
  return pocs.filter((p) => isEligiblePrepPocProfile(p as PocProfileLike, assignmentPocIds));
}

/**
 * Student-level outcome bucket for aggregation across a POC's LMPs.
 * Conversion/placement comes only from the pipeline Converted box — not LMP status
 * or global students.placement_status.
 */
export function effectiveStatusBucketForStudentLmp(
  lmpBucket: StatusBucket,
  candidate?: CandidateRaw | null,
): StatusBucket {
  if (isCandidateInConvertedPipeline(candidate)) return "converted";

  // LMP may be marked converted/closed while individual candidates remain in earlier rounds.
  if (lmpBucket === "converted") return "prepOngoing";
  return lmpBucket;
}

/** Distinct student_ids whose pipeline_stage is in the Converted box for this LMP. */
export function resolvePlacedStudentIdsOnLmp(candidatesOnLmp: CandidateRaw[]): Set<string> {
  const placed = new Set<string>();
  for (const c of candidatesOnLmp) {
    if (!c.student_id) continue;
    if (isCandidateInConvertedPipeline(c)) placed.add(c.student_id);
  }
  return placed;
}

export function buildSessionCountsByPocStudent(
  sessions: HeatmapSessionRaw[],
  pocLinkIndex: Map<string, { prepIds: Set<string>; supportIds: Set<string> }>,
): Map<string, Map<string, number>> {
  const lmpToPocs = new Map<string, Set<string>>();
  for (const [pocId, entry] of pocLinkIndex) {
    for (const lmpId of [...entry.prepIds, ...entry.supportIds]) {
      const pocs = lmpToPocs.get(lmpId) ?? new Set<string>();
      pocs.add(pocId);
      lmpToPocs.set(lmpId, pocs);
    }
  }

  const counts = new Map<string, Map<string, number>>();
  for (const session of sessions) {
    if (!session.lmp_id || !session.student_id) continue;
    const completed =
      norm(session.status) === "completed" ||
      norm(session.status) === "done" ||
      Boolean(session.completed_at);
    if (!completed) continue;

    for (const pocId of lmpToPocs.get(session.lmp_id) ?? []) {
      const byStudent = counts.get(pocId) ?? new Map<string, number>();
      byStudent.set(session.student_id, (byStudent.get(session.student_id) ?? 0) + 1);
      counts.set(pocId, byStudent);
    }
  }
  return counts;
}

export type StudentClass = {
  prepStatus: "notStarted" | "prepOngoing" | "prepDone" | null;
  outcome: "placed" | "notPlaced" | "onHold" | "otherReasons" | null;
  isActive: boolean;
};

export function classifyStudentStatuses(statuses: StatusBucket[]): StudentClass {
  const has = (b: StatusBucket) => statuses.includes(b);
  if (has("converted")) return { outcome: "placed", prepStatus: null, isActive: false };
  if (has("notConverted")) return { outcome: "notPlaced", prepStatus: null, isActive: false };
  if (has("otherReasons")) return { outcome: "otherReasons", prepStatus: null, isActive: false };
  if (has("onHold")) return { outcome: "onHold", prepStatus: null, isActive: false };
  if (has("unknown")) return { outcome: "otherReasons", prepStatus: null, isActive: false };

  const isActive = has("notStarted") || has("prepOngoing") || has("prepDone");
  let prepStatus: StudentClass["prepStatus"] = null;
  if (has("prepDone")) prepStatus = "prepDone";
  else if (has("prepOngoing")) prepStatus = "prepOngoing";
  else if (has("notStarted")) prepStatus = "notStarted";
  return { outcome: null, prepStatus, isActive };
}
