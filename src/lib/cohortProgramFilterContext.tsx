import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { StudentFilterState } from "@/lib/hooks/useStudentFilters";

const STORAGE_KEY = "preplane:cohort-program-filter";

type CohortProgramFilterCtx = StudentFilterState & {
  setCohortIds: (ids: string[]) => void;
  setProgramIds: (ids: string[]) => void;
  clear: () => void;
  hasFilters: boolean;
};

const Ctx = createContext<CohortProgramFilterCtx | null>(null);

function readStored(): StudentFilterState {
  if (typeof window === "undefined") return { cohortIds: [], programIds: [] };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { cohortIds: [], programIds: [] };
    const parsed = JSON.parse(raw) as StudentFilterState;
    return {
      cohortIds: Array.isArray(parsed.cohortIds) ? parsed.cohortIds.filter(Boolean) : [],
      programIds: Array.isArray(parsed.programIds) ? parsed.programIds.filter(Boolean) : [],
    };
  } catch {
    return { cohortIds: [], programIds: [] };
  }
}

export function CohortProgramFilterProvider({ children }: { children: ReactNode }) {
  const [cohortIds, setCohortIdsState] = useState<string[]>(() => readStored().cohortIds);
  const [programIds, setProgramIdsState] = useState<string[]>(() => readStored().programIds);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ cohortIds, programIds }));
  }, [cohortIds, programIds]);

  const setCohortIds = useCallback((ids: string[]) => {
    setCohortIdsState(ids);
  }, []);

  const setProgramIds = useCallback((ids: string[]) => {
    setProgramIdsState(ids);
  }, []);

  const clear = useCallback(() => {
    setCohortIdsState([]);
    setProgramIdsState([]);
  }, []);

  const value = useMemo<CohortProgramFilterCtx>(
    () => ({
      cohortIds,
      programIds,
      setCohortIds,
      setProgramIds,
      clear,
      hasFilters: cohortIds.length > 0 || programIds.length > 0,
    }),
    [cohortIds, programIds, setCohortIds, setProgramIds, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCohortProgramFilter(): CohortProgramFilterCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useCohortProgramFilter must be used within CohortProgramFilterProvider");
  }
  return ctx;
}
