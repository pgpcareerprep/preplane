import { deriveLmpCohortProgram } from "@/lib/lmpCohortProgram";
import { useLmpCohortProgramSummaries } from "@/lib/hooks/useCohortProgram";

export function LmpCohortProgramBadges({
  candidates,
}: {
  candidates: { student?: { cohort_code?: string | null; program_code?: string | null } | null; metadata?: Record<string, string> | null }[];
}) {
  const { cohortLabel, programLabel } = deriveLmpCohortProgram(candidates);
  if (cohortLabel === "—" && programLabel === "—") return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px]">
      {cohortLabel !== "—" && (
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
          Cohort: {cohortLabel}
        </span>
      )}
      {programLabel !== "—" && (
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
          Program: {programLabel}
        </span>
      )}
    </div>
  );
}

export function LmpCohortProgramBadgeByLmp({ lmpId }: { lmpId: string }) {
  const { data: summaries } = useLmpCohortProgramSummaries();
  const summary = summaries?.get(lmpId);
  if (!summary || (summary.cohortLabel === "—" && summary.programLabel === "—")) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px]">
      {summary.cohortLabel !== "—" && (
        <span className="rounded-full border border-n200 bg-n50 px-2 py-0.5 text-n600">
          {summary.cohortLabel}
        </span>
      )}
      {summary.programLabel !== "—" && (
        <span className="rounded-full border border-n200 bg-n50 px-2 py-0.5 text-n600">
          {summary.programLabel}
        </span>
      )}
    </div>
  );
}
