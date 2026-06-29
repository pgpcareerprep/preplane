import type { StudentCohortFields } from "@/lib/cohortProgram";
import { getStudentCohortCode, getStudentProgramCode } from "@/lib/cohortProgram";

export type LmpCohortProgramSummary = {
  cohortLabel: string;
  programLabel: string;
  isMixedCohort: boolean;
  isMixedProgram: boolean;
};

type CandidateWithStudent = {
  student?: StudentCohortFields | null;
  metadata?: Record<string, string> | null;
};

const MIXED = "Mixed";

function cohortCodeFromCandidate(c: CandidateWithStudent): string {
  const s = c.student;
  if (s) return getStudentCohortCode(s);
  return (c.metadata?.cohort_code ?? "").trim();
}

function programCodeFromCandidate(c: CandidateWithStudent): string {
  const s = c.student;
  if (s) return getStudentProgramCode(s);
  return (c.metadata?.program_code ?? "").trim();
}

export function deriveLmpCohortProgram(
  candidates: CandidateWithStudent[],
): LmpCohortProgramSummary {
  const cohortCodes = new Set<string>();
  const programCodes = new Set<string>();

  for (const c of candidates) {
    const co = cohortCodeFromCandidate(c);
    const pr = programCodeFromCandidate(c);
    if (co) cohortCodes.add(co);
    if (pr) programCodes.add(pr);
  }

  const cohortList = [...cohortCodes];
  const programList = [...programCodes];

  const cohortLabel =
    cohortList.length === 0 ? "—" :
    cohortList.length === 1 ? cohortList[0] :
    `${MIXED} Cohort`;

  const programLabel =
    programList.length === 0 ? "—" :
    programList.length === 1 ? programList[0] :
    `${MIXED} Program`;

  return {
    cohortLabel,
    programLabel,
    isMixedCohort: cohortList.length > 1,
    isMixedProgram: programList.length > 1,
  };
}

export function buildCandidateMetadataSnapshot(student: StudentCohortFields): Record<string, string> {
  const cohortCode = getStudentCohortCode(student);
  const programCode = getStudentProgramCode(student);
  const out: Record<string, string> = {};
  if (student.cohort_id) out.cohort_id = student.cohort_id;
  if (cohortCode) out.cohort_code = cohortCode;
  if (student.program_id) out.program_id = student.program_id;
  if (programCode) out.program_code = programCode;
  const batch = student.batch_label || (cohortCode && programCode ? `${cohortCode} · ${programCode}` : "");
  if (batch) out.derived_batch_label = batch;
  return out;
}
