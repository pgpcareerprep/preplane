import { Users } from "lucide-react";
import type { LmpRecord } from "@/lib/lmpTypes";
import type { Candidate, Round } from "@/lib/lmpProcessMutations";

/**
 * Compact round-wise distribution. Uses real configured rounds and the
 * supplied candidate list when provided; falls back to a derived breakdown
 * for legacy callers that haven't been wired through yet.
 */
export function PipelineSnapshotCard({
  rec,
  mode = "action",
  rounds,
  candidates,
}: {
  rec: LmpRecord;
  mode?: "action" | "summary";
  rounds?: Round[];
  candidates?: Candidate[];
}) {
  const breakdown = rounds && candidates
    ? realBreakdown(rounds, candidates, rec)
    : mockBreakdown(rec);
  const summary = mode === "summary";
  const total = candidates?.length ?? rec.candidates;

  return (
    <div className={summary ? "rounded-2xl bg-n50/40 border border-n200 p-4" : "rounded-2xl bg-card border border-n200 shadow-sm p-4"}>
      <h4 className="text-[13px] font-semibold text-n800 mb-3">Pipeline Snapshot</h4>
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-6">
          <Users className="h-5 w-5 text-n400 mb-1.5" strokeWidth={1.75} />
          <div className="text-[12.5px] font-medium text-n700">No candidates yet</div>
          <div className="text-[11px] text-n500 mt-0.5">Use Add Candidates above to populate the pipeline.</div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {breakdown.map((r) => (
            <div
              key={r.label}
              className="rounded-lg border border-n200 bg-n50/40 px-2.5 py-2 text-center"
            >
              <div className="text-[18px] font-bold text-n900 tabular-nums leading-none">
                {r.count}
              </div>
              <div className="text-[10.5px] text-n500 mt-1 leading-tight">{r.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function realBreakdown(rounds: Round[], candidates: Candidate[], rec: LmpRecord) {
  void rec;
  const pool = candidates.filter((c) => !c.roundId || c.roundId === "pool").length;
  const perRound = rounds.map((r) => ({
    label: shortLabel(r.name),
    count: candidates.filter((c) => c.roundId === r.id).length,
  }));
  return [{ label: "Pool", count: pool }, ...perRound];
}

function shortLabel(name: string) {
  // "R1 — HR Screen" → keep concise
  return name.length > 14 ? name.slice(0, 14) + "…" : name;
}

function mockBreakdown(rec: LmpRecord) {
  const c = rec.candidates;
  return [
    { label: "Pool",        count: Math.max(0, c - 4) },
    { label: "R1 HR",       count: Math.min(2, Math.floor(c / 3)) },
    { label: "R2 Tech",     count: Math.min(2, Math.ceil(c / 3)) },
    { label: "R3 Case",     count: Math.max(0, Math.floor(c / 4)) },
    { label: "Converted ",  count: Math.max(0, Math.floor(c / 5)) },
    { label: "Offer",       count: rec.status === "converted" ? 1 : 0 },
  ];
}
