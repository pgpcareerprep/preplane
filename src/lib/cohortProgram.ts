import type { Tables } from "@/integrations/supabase/types";

export type CohortRow = Tables<"cohorts">;
export type ProgramRow = Tables<"programs">;

export type StudentCohortFields = {
  cohort_id?: string | null;
  program_id?: string | null;
  cohort?: string | null;
  cohort_code?: string | null;
  cohort_name?: string | null;
  program_code?: string | null;
  program_name?: string | null;
  batch_label?: string | null;
  roll_no?: string | null;
};

export const BATCH_LABEL_SEP = " · ";

export function normalizeCohortCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeProgramCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function formatBatchLabel(cohortCode?: string | null, programCode?: string | null): string {
  const c = (cohortCode ?? "").trim();
  const p = (programCode ?? "").trim();
  if (!c || !p) return "";
  return `${c}${BATCH_LABEL_SEP}${p}`;
}

/** Legacy heuristic when FKs are missing — matches pre-migration UI behavior. */
export function deriveLegacyProgramCode(cohortText?: string | null, rollNo?: string | null): string {
  const cohort = String(cohortText ?? "").trim().toUpperCase();
  if (cohort) {
    if (cohort.startsWith("YLC")) return "YLC";
    if (cohort.startsWith("PGP") || cohort.startsWith("TBM") || cohort.startsWith("DBM")) return "TBM";
    return cohort;
  }
  const roll = String(rollNo ?? "").trim().toUpperCase();
  if (roll.startsWith("YLC")) return "YLC";
  if (roll.startsWith("PGP")) return "TBM";
  return "";
}

export function getStudentProgramCode(
  student: StudentCohortFields,
  programs?: ProgramRow[],
): string {
  if (student.program_code) return student.program_code;
  const prog = programs?.find((p) => p.id === student.program_id);
  if (prog) return prog.code;
  return deriveLegacyProgramCode(student.cohort, student.roll_no);
}

export function getStudentCohortCode(
  student: StudentCohortFields,
  cohorts?: CohortRow[],
): string {
  if (student.cohort_code) return student.cohort_code;
  const co = cohorts?.find((c) => c.id === student.cohort_id);
  if (co) return co.code;
  return "";
}

export function getStudentBatchLabel(
  student: StudentCohortFields,
  cohorts?: CohortRow[],
  programs?: ProgramRow[],
): string {
  if (student.batch_label) return student.batch_label;
  const cohortCode = getStudentCohortCode(student, cohorts);
  const programCode = getStudentProgramCode(student, programs);
  const label = formatBatchLabel(cohortCode, programCode);
  if (label) return label;
  const legacy = deriveLegacyProgramCode(student.cohort, student.roll_no);
  if (legacy && cohortCode) return formatBatchLabel(cohortCode, legacy);
  return student.cohort?.trim() || legacy || "—";
}

export type ProgramWithAliases = Pick<ProgramRow, "id" | "code" | "cohort_id" | "aliases">;

export function resolveProgramFromLegacyText(
  cohortText: string | null | undefined,
  rollNo: string | null | undefined,
  programs: ProgramWithAliases[],
): ProgramWithAliases | null {
  const cohort = String(cohortText ?? "").trim().toUpperCase();
  const roll = String(rollNo ?? "").trim().toUpperCase();

  for (const p of programs) {
    const code = p.code.toUpperCase();
    const aliases = (p.aliases ?? []).map((a) => a.toUpperCase());
    const match = (s: string) =>
      s.startsWith(code) || aliases.some((a) => a && s.startsWith(a));
    if (cohort && match(cohort)) return p;
    if (roll && match(roll)) return p;
  }

  const legacy = deriveLegacyProgramCode(cohortText, rollNo);
  if (!legacy) return null;
  return programs.find((p) => p.code.toUpperCase() === legacy) ?? null;
}

export function formatLegacyCohortText(cohortCode: string, programCode: string): string {
  return `${cohortCode}${BATCH_LABEL_SEP}${programCode}`;
}

export function parseAliasesInput(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function aliasesToInput(aliases: string[] | null | undefined): string {
  return (aliases ?? []).join(", ");
}
