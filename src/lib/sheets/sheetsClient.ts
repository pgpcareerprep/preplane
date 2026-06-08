import { supabase } from "@/integrations/supabase/client";

/**
 * GOOGLE SHEETS INTEGRATION — UNIDIRECTIONAL (2026-05).
 *
 * Architecture: Frontend ↔ DB (bidirectional). DB → Sheet (one way, via
 * `sheet_write_queue` + `sheets-retry-sweeper` cron). The frontend never
 * writes to Google Sheets directly anymore.
 *
 * This file is preserved as a stub so legacy imports keep compiling, but
 * every operation is a no-op and `pushToSheet` is a hard skip. Mirroring is
 * the database trigger's job — see migration `enqueue_lmp_sheet_mirror`.
 */

void supabase;

export type SheetOp =
  | { op: "metadata" }
  | { op: "list"; tab: string; headerRow?: number }
  | { op: "get"; tab: string; id: string; headerRow?: number }
  | { op: "insert"; tab: string; row: Record<string, unknown>; headerRow?: number }
  | { op: "update"; tab: string; id: string; patch: Record<string, unknown>; headerRow?: number; findBy?: Record<string, string>; rowNumber?: number }
  | { op: "delete"; tab: string; id: string; headerRow?: number; rowNumber?: number; findBy?: Record<string, string> };

export async function sheetsInvoke<T = unknown>(payload: SheetOp): Promise<T> {
  const op = (payload as { op: string }).op;
  if (import.meta.env.DEV) {
    console.warn("[sheetsClient] no-op stub called — op:", op, payload);
  }
  switch (op) {
    case "metadata":
      return { sheets: [], spreadsheetId: "" } as unknown as T;
    case "list":
      return { rows: [], tab: (payload as { tab?: string }).tab ?? "", count: 0, headers: [] } as unknown as T;
    case "get":
      return { row: {}, tab: (payload as { tab?: string }).tab ?? "" } as unknown as T;
    case "insert":
      return { row: {}, tab: (payload as { tab?: string }).tab ?? "", sheetRowNumber: undefined } as unknown as T;
    case "update":
      return { row: {}, tab: (payload as { tab?: string }).tab ?? "", skipped: true } as unknown as T;
    case "delete":
      return { deleted: true, id: (payload as { id?: string }).id ?? "", tab: (payload as { tab?: string }).tab ?? "" } as unknown as T;
    default:
      return {} as T;
  }
}

export const sheets = {
  metadata: () => sheetsInvoke<{ sheets: { title: string; sheetId: number; rowCount: number; colCount: number }[]; spreadsheetId: string }>({ op: "metadata" }),
  list: <T = Record<string, string>>(tab: string, headerRow?: number) =>
    sheetsInvoke<{ rows: T[]; tab: string; count: number; headers: string[] }>({ op: "list", tab, headerRow }),
  get: <T = Record<string, string>>(tab: string, id: string, headerRow?: number) =>
    sheetsInvoke<{ row: T; tab: string }>({ op: "get", tab, id, headerRow }),
  insert: <T = Record<string, string>>(tab: string, row: Record<string, unknown>, headerRow?: number) =>
    sheetsInvoke<{ row: T; tab: string }>({ op: "insert", tab, row, headerRow }),
  update: <T = Record<string, string>>(tab: string, id: string, patch: Record<string, unknown>, headerRow?: number, findBy?: Record<string, string>, rowNumber?: number) =>
    sheetsInvoke<{ row: T; tab: string }>({ op: "update", tab, id, patch, headerRow, findBy, rowNumber }),
  delete: (tab: string, id: string, headerRow?: number, opts?: { rowNumber?: number; findBy?: Record<string, string> }) =>
    sheetsInvoke<{ deleted: boolean; id: string; tab: string; rowNumber?: number }>({
      op: "delete", tab, id, headerRow, rowNumber: opts?.rowNumber, findBy: opts?.findBy,
    }),
};

export interface PushOptions {
  tab: string;
  id?: string;
  findBy?: Record<string, string>;
  rowNumber?: number;
  headerRow?: number;
  patch: Record<string, unknown>;
  dbTable?: "lmp_processes" | "lmp_candidates" | "lmp_mentors" | "lmp_checklists";
}

export function markIngested(_key: string) { /* no-op */ }

/**
 * Legacy entrypoint. Now a guaranteed skip — frontend never writes to Sheets.
 * If a caller needs the sheet updated, write to the DB and let the trigger
 * enqueue a `sheet_write_queue` row for the cron to drain.
 */
export async function pushToSheet(
  _lmpId: string,
  _opts: PushOptions,
): Promise<{ skipped: boolean; reason?: string }> {
  return { skipped: true, reason: "frontend_push_disabled_db_is_source_of_truth" };
}
