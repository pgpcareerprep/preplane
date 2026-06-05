import { useEffect, useState } from "react";
import { sheetSyncBus, type SheetSyncState } from "@/lib/sheets/sheetSyncBus";

export function useSheetSyncStatus(): SheetSyncState & { retry: () => void } {
  const [state, setState] = useState<SheetSyncState>(() => sheetSyncBus.get());

  useEffect(() => sheetSyncBus.subscribe(setState), []);

  return {
    ...state,
    retry: () => {
      if (state.lastFailed) void state.lastFailed();
    },
  };
}
