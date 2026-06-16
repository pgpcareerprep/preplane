export const LMP_PIPELINE_SHEET_HEADERS = [
  "Shortlisted (Pool) - Number",
  "Shortlisted (Pool) - Name(s)",
  "R1 - Numbers",
  "R1 - Names",
  "R2 - Numbers",
  "R2 - Names",
  "R3 - Numbers",
  "R3 - Names",
  "Final Converted Numbers",
  "Converted Names",
] as const;

export type LmpPipelineCalc = {
  pool_count?: number | string | null;
  pool_names?: string | null;
  r1_count?: number | string | null;
  r1_names?: string | null;
  r2_count?: number | string | null;
  r2_names?: string | null;
  r3_count?: number | string | null;
  r3_names?: string | null;
  converted_count?: number | string | null;
  converted_names?: string | null;
  offer_count?: number | string | null;
};

export function buildLmpPipelineSheetPatch(calc: LmpPipelineCalc | null | undefined): Record<string, unknown> {
  return {
    "Shortlisted (Pool) - Number": calc?.pool_count ?? 0,
    "Shortlisted (Pool) - Name(s)": calc?.pool_names ?? "",
    "R1 - Numbers": calc?.r1_count ?? 0,
    "R1 - Names": calc?.r1_names ?? "",
    "R2 - Numbers": calc?.r2_count ?? 0,
    "R2 - Names": calc?.r2_names ?? "",
    "R3 - Numbers": calc?.r3_count ?? 0,
    "R3 - Names": calc?.r3_names ?? "",
    "Final Converted Numbers": calc?.converted_count ?? calc?.offer_count ?? 0,
    "Converted Names": calc?.converted_names ?? "",
  };
}

export function normalizePipelineSheetValue(value: unknown): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (/^-?\d+(\.0+)?$/.test(normalized)) return String(Number(normalized));
  return normalized;
}
