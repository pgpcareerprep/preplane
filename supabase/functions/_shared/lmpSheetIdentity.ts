export type LmpSheetRowLookup = {
  rowIndex: number;
};

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Locate an LMP Tracker row without allowing a newly generated LMP ID to
 * inherit an older row that happens to share company/role.
 */
export function findLmpSheetRow(
  headers: unknown[],
  rows: unknown[][],
  identity: { lmpCode?: string | null; company: string; role: string },
): LmpSheetRowLookup {
  const lmpCode = normalized(identity.lmpCode);
  const lmpIdCol = headers.indexOf("LMP ID");

  if (lmpCode) {
    if (lmpIdCol !== -1) {
      for (let i = 1; i < rows.length; i++) {
        if (normalized(rows[i]?.[lmpIdCol]) === lmpCode) {
          return { rowIndex: i };
        }
      }
    }
    return { rowIndex: -1 };
  }
  return { rowIndex: -1 };
}
