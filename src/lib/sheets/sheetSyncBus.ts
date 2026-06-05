// Lightweight event bus + state holder for sheet sync status.
// Consumed by useSheetSyncStatus / SyncIndicator; emitted from sheetsClient
// (push) and from anywhere that triggers sync-ingest (pull).

export type SheetSyncStatus = "idle" | "pushing" | "pulling" | "error" | "fallback";

export interface SheetSyncState {
  status: SheetSyncStatus;
  lastSyncedAt: number | null;
  errorMessage: string | null;
  // Last failed op so the SyncIndicator's Retry button can replay it.
  lastFailed: null | (() => Promise<unknown>);
  // True when the last sheets call returned a fallback envelope (e.g. rate
  // limited). UI shows a "Sheet offline — showing cached DB data" banner.
  fallbackActive: boolean;
}

const state: SheetSyncState = {
  status: "idle",
  lastSyncedAt: null,
  errorMessage: null,
  lastFailed: null,
  fallbackActive: false,
};

type Listener = (s: SheetSyncState) => void;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l({ ...state });
}

export const sheetSyncBus = {
  get(): SheetSyncState {
    return { ...state };
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    l({ ...state });
    return () => {
      listeners.delete(l);
    };
  },
  setPushing() {
    state.status = "pushing";
    state.errorMessage = null;
    emit();
  },
  setPulling() {
    state.status = "pulling";
    state.errorMessage = null;
    emit();
  },
  setIdle() {
    state.status = state.fallbackActive ? "fallback" : "idle";
    state.lastSyncedAt = Date.now();
    state.errorMessage = null;
    state.lastFailed = null;
    emit();
  },
  setError(message: string, retry?: () => Promise<unknown>) {
    state.status = "error";
    state.errorMessage = message;
    state.lastFailed = retry ?? null;
    emit();
  },
  setFallback(active: boolean, reason?: string) {
    state.fallbackActive = active;
    if (active) {
      state.status = "fallback";
      state.errorMessage = reason ?? "Sheet temporarily unavailable — showing cached database data.";
    } else if (state.status === "fallback") {
      state.status = "idle";
      state.errorMessage = null;
    }
    emit();
  },
};

/**
 * Wraps a sync operation and drives the bus through pushing/pulling → idle/error.
 * The retry binding lets SyncIndicator replay the exact same op on failure.
 */
export async function withSheetSync<T>(
  direction: "push" | "pull",
  op: () => Promise<T>,
): Promise<T> {
  const start = direction === "push" ? sheetSyncBus.setPushing : sheetSyncBus.setPulling;
  start();
  try {
    const result = await op();
    sheetSyncBus.setIdle();
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    sheetSyncBus.setError(msg, () => withSheetSync(direction, op));
    throw err;
  }
}
