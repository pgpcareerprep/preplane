import type { Round } from "@/lib/lmpProcessMutations";

/**
 * Resolve a candidate's stored `pipeline_stage` to one of the LMP's
 * configured round ids. Falls back to "pool" when no round matches.
 *
 * Matching order:
 *   1. Direct id/name match (case-insensitive) against the configured rounds
 *   2. "shortlisted"            → first configured round
 *   3. "converted"/"offer"/"final" → last configured round (or "offer" if present)
 *   4. otherwise                → "pool"
 */
export function resolveStageToRoundId(
  stage: string | null | undefined,
  rounds: Round[],
): string {
  const s = (stage || "").trim().toLowerCase();
  if (!s || s === "pool") return "pool";

  const direct = rounds.find(
    (r) => r.id.toLowerCase() === s || r.name.toLowerCase() === s,
  );
  if (direct) return direct.id;

  if (s === "shortlisted") return rounds[0]?.id ?? "pool";

  if (s === "converted" || s === "offer" || s === "final") {
    const finalRound = rounds.find(
      (r) => ["final", "offer", "converted"].includes(r.id.toLowerCase()),
    );
    if (finalRound) return finalRound.id;
    return rounds[rounds.length - 1]?.id ?? "pool";
  }

  return "pool";
}

/**
 * Map a sheet round index (0=R1, 1=R2, 2=R3, 3=Converted) to a configured
 * round id. Used to flow names parsed from the LMP sheet's R1/R2/R3/Convert
 * columns into the configured pipeline columns.
 */
export function sheetIndexToRoundId(idx: 0 | 1 | 2 | 3, rounds: Round[]): string {
  if (idx === 3) {
    const finalRound = rounds.find(
      (r) => ["final", "offer", "converted"].includes(r.id.toLowerCase()),
    );
    if (finalRound) return finalRound.id;
    return rounds[rounds.length - 1]?.id ?? "pool";
  }
  return rounds[idx]?.id ?? "pool";
}
