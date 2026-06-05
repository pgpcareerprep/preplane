import { useSyncExternalStore } from "react";
import type { Mentor, MentorSource } from "@/lib/mentor";
import type { ShortlistEntry } from "@/components/lmp/detail/mentors/ShortlistedTable";
import type { Assignment } from "@/components/lmp/detail/mentors/AssignedTable";
import { EMPTY_MENTOR_FILTERS, type MentorFilterState } from "@/components/lmp/detail/mentors/MentorFilters";
import type { MatchContext } from "@/components/lmp/detail/mentors/MatchContextModal";

export type MentorsPhase = "empty" | "matching" | "results";
export type MentorsSubTab = "suggested" | "shortlisted" | "assigned";

export type MentorsTabState = {
  phase: MentorsPhase;
  subTab: MentorsSubTab;
  suggested: Mentor[];
  shortlisted: ShortlistEntry[];
  assignments: Assignment[];
  filters: MentorFilterState;
  sort: "score" | "rating" | "outcome";
  activeSources: MentorSource[];
  reviewMode: boolean;
  _matchContext?: MatchContext | null;
};

const DEFAULT_STATE: MentorsTabState = {
  phase: "empty",
  subTab: "suggested",
  suggested: [],
  shortlisted: [],
  assignments: [],
  filters: EMPTY_MENTOR_FILTERS,
  sort: "score",
  activeSources: ["MU", "ALU", "EXT"],
  reviewMode: false,
};

const STORAGE_PREFIX = "lmp.";
const STORAGE_SUFFIX = ".mentorsTab.v2";
const storageKey = (reqId: string) => `${STORAGE_PREFIX}${reqId}${STORAGE_SUFFIX}`;

const stores = new Map<string, MentorsTabState>();
const listeners = new Map<string, Set<() => void>>();

function loadFromStorage(reqId: string): MentorsTabState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(storageKey(reqId));
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<MentorsTabState>;
    return { ...DEFAULT_STATE, ...parsed, _matchContext: null };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveToStorage(reqId: string, state: MentorsTabState) {
  if (typeof window === "undefined") return;
  try {
    const { _matchContext: _omit, ...persistable } = state;
    window.localStorage.setItem(storageKey(reqId), JSON.stringify(persistable));
  } catch {
    // ignore quota / serialization errors
  }
}

function getOrInit(reqId: string): MentorsTabState {
  let s = stores.get(reqId);
  if (!s) {
    s = loadFromStorage(reqId);
    stores.set(reqId, s);
  }
  return s;
}

function emit(reqId: string) {
  listeners.get(reqId)?.forEach((l) => l());
}

export function useMentorsTabState(reqId: string) {
  const subscribe = (cb: () => void) => {
    let set = listeners.get(reqId);
    if (!set) { set = new Set(); listeners.set(reqId, set); }
    set.add(cb);
    return () => { set!.delete(cb); };
  };
  const getSnapshot = () => getOrInit(reqId);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setState = (
    updater: Partial<MentorsTabState> | ((prev: MentorsTabState) => Partial<MentorsTabState>),
  ) => {
    const prev = getOrInit(reqId);
    const patch = typeof updater === "function" ? updater(prev) : updater;
    const next = { ...prev, ...patch };
    stores.set(reqId, next);
    saveToStorage(reqId, next);
    emit(reqId);
  };

  return [state, setState] as const;
}
