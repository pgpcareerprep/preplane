import { useMemo } from "react";
import { useCohorts, usePrograms } from "@/lib/hooks/useCohortProgram";
import { useCohortProgramFilter } from "@/lib/cohortProgramFilterContext";
import type { MultiSelectFilterOption } from "@/components/ui/multi-select-filter";

/** Cohort/program dropdown options + setters with cohort→program scoping. */
export function useCohortProgramFilterOptions() {
  const { cohortIds, programIds, setCohortIds, setProgramIds, clear, hasFilters } =
    useCohortProgramFilter();
  const { data: cohortMaster = [] } = useCohorts(false);
  const { data: programMaster = [] } = usePrograms(null, false);
  const cohortById = useMemo(() => new Map(cohortMaster.map((c) => [c.id, c])), [cohortMaster]);
  const selectedCohortSet = useMemo(() => new Set(cohortIds), [cohortIds]);

  const cohortOptions = useMemo<MultiSelectFilterOption[]>(
    () => cohortMaster.map((c) => ({
      value: c.id,
      label: c.code,
      description: c.name,
    })),
    [cohortMaster],
  );

  const programOptions = useMemo<MultiSelectFilterOption[]>(() => {
    const scoped = cohortIds.length
      ? programMaster.filter((p) => selectedCohortSet.has(p.cohort_id))
      : programMaster;
    const codeCounts = scoped.reduce((acc, p) => {
      acc.set(p.code, (acc.get(p.code) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
    const showCohortPrefix = cohortIds.length !== 1;
    return scoped.map((p) => {
      const cohortCode = cohortById.get(p.cohort_id)?.code ?? "";
      const duplicateCode = (codeCounts.get(p.code) ?? 0) > 1;
      return {
        value: p.id,
        label: showCohortPrefix || duplicateCode ? `${cohortCode} · ${p.code}` : p.code,
        description: p.name,
      };
    });
  }, [cohortById, programMaster, cohortIds, selectedCohortSet]);

  const setCohorts = (ids: string[]) => {
    const allowedProgramIds = new Set(
      (ids.length ? programMaster.filter((p) => ids.includes(p.cohort_id)) : programMaster)
        .map((p) => p.id),
    );
    setCohortIds(ids);
    setProgramIds(programIds.filter((id) => allowedProgramIds.has(id)));
  };

  return {
    cohortIds,
    programIds,
    cohortOptions,
    programOptions,
    cohortMaster,
    programMaster,
    setCohorts,
    setProgramIds,
    clear,
    hasFilters,
  };
}
