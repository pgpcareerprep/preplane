import type { Round } from "@/lib/lmpProcessMutations";

export const FIXED_PIPELINE_ROUNDS: Round[] = [
  { id: "r1", name: "R1", type: "" },
  { id: "r2", name: "R2", type: "" },
  { id: "r3", name: "R3", type: "" },
  { id: "converted", name: "Converted", type: "Offer" },
];

export const FIXED_PIPELINE_COLUMNS = [
  { id: "pool", label: "Shortlisted Pool" },
  ...FIXED_PIPELINE_ROUNDS.map((round) => ({ id: round.id, label: round.name })),
] as const;

export type FixedPipelineStage = typeof FIXED_PIPELINE_COLUMNS[number]["id"];

/**
 * Resolve a candidate's stored `pipeline_stage` to the fixed LMP pipeline:
 * Pool, R1, R2, R3, Converted. Older aliases are preserved for historical rows.
 */
export function resolveStageToRoundId(
  stage: string | null | undefined,
  rounds: Round[] = [],
): FixedPipelineStage {
  const s = (stage || "").trim().toLowerCase();
  if (!s || s === "pool" || s === "shortlisted" || s === "shortlisted_pool" || s === "shortlisted-pool") {
    return "pool";
  }

  const direct = rounds.find(
    (r) => r.id.toLowerCase() === s || r.name.toLowerCase() === s,
  );
  if (direct) return normalizeFixedStageId(direct.id);

  if (["r1", "r1_shortlisted", "round_1", "round1"].includes(s)) return "r1";
  if (["r2", "r2_shortlisted", "round_2", "round2"].includes(s)) return "r2";
  if (["r3", "r3_shortlisted", "round_3", "round3"].includes(s)) return "r3";
  if (["converted", "offer", "final", "accepted"].includes(s)) return "converted";

  return "pool";
}

export function normalizeFixedStageId(stage: string): FixedPipelineStage {
  const s = stage.trim().toLowerCase();
  if (s === "r1") return "r1";
  if (s === "r2") return "r2";
  if (s === "r3") return "r3";
  if (s === "converted") return "converted";
  return "pool";
}

/**
 * Map sheet stage index to the fixed pipeline.
 */
export function sheetIndexToRoundId(idx: 0 | 1 | 2 | 3 | 4, _rounds: Round[] = []): FixedPipelineStage {
  return FIXED_PIPELINE_COLUMNS[idx]?.id ?? "pool";
}
