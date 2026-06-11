export type LmpSheetRowLookup = {
  rowIndex: number;
  lmpIdColumn: number;
  matches: number[];
  error?:
    | "MISSING_LMP_ID_HEADER"
    | "DUPLICATE_LMP_ID_HEADERS"
    | "MISALIGNED_LMP_ID_HEADER"
    | "MISALIGNED_LMP_TRACKER_HEADERS"
    | "DUPLICATE_LMP_ID_ROWS";
};

export const LMP_TRACKER_HEADER_ROW = 14;
export const LMP_TRACKER_FIRST_DATA_ROW = 15;
export const LMP_ID_COLUMN_INDEX = 26; // AA
export const CANONICAL_LMP_TRACKER_HEADERS = [
  "Date", "Company", "Role", "Domain", "Status", "Type", "Daily Progress",
  "Prep Doc Shared", "Mentor Aligned", "Assignment Review", "1:1 mock completed",
  "Next Progress Date", "Next Progress Type", "R1 Shortlisted", "R2 Shortlisted",
  "R3 Shortlisted", "Offer", "Converted Name(s)", "Prep Doc", "Prep POC",
  "Support POC", "Outreach POC", "Closing Date", "Mentor Selected",
  "Mentor Rating", "JD", "LMP ID",
] as const;

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function getLmpTrackerHeaderDrift(headers: unknown[]) {
  return CANONICAL_LMP_TRACKER_HEADERS.flatMap((expected, index) => {
    const actual = String(headers[index] ?? "");
    return normalized(actual) === normalized(expected)
      ? []
      : [{ column: index + 1, expected, actual }];
  });
}

export function validateLmpTrackerHeaders(headers: unknown[]): Pick<LmpSheetRowLookup, "lmpIdColumn" | "matches" | "error"> {
  const matches = headers
    .map((header, index) => normalized(header) === "lmp id" ? index : -1)
    .filter((index) => index !== -1);
  if (matches.length === 0) return { lmpIdColumn: -1, matches, error: "MISSING_LMP_ID_HEADER" };
  if (matches.length > 1) return { lmpIdColumn: -1, matches, error: "DUPLICATE_LMP_ID_HEADERS" };
  if (matches[0] !== LMP_ID_COLUMN_INDEX) {
    return { lmpIdColumn: matches[0], matches, error: "MISALIGNED_LMP_ID_HEADER" };
  }
  // Display labels may legitimately differ from the canonical registry
  // (for example line breaks, "Prep Doc Link", or a legacy Comment column).
  // Identity safety depends on one unique LMP ID column at AA, not every
  // visible label being byte-identical. Report drift separately without
  // blocking DB-to-Sheet writes.
  return { lmpIdColumn: matches[0], matches };
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
  const validation = validateLmpTrackerHeaders(headers);
  if (validation.error) return { rowIndex: -1, ...validation };

  if (lmpCode) {
    const rowMatches: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      if (normalized(rows[i]?.[validation.lmpIdColumn]) === lmpCode) {
        rowMatches.push(i);
      }
    }
    if (rowMatches.length > 1) {
      return { rowIndex: -1, ...validation, error: "DUPLICATE_LMP_ID_ROWS" };
    }
    if (rowMatches.length === 1) return { rowIndex: rowMatches[0], ...validation };
  }
  return { rowIndex: -1, ...validation };
}

export function findLmpSheetRowIndexes(headers: unknown[], rows: unknown[][], lmpCode: string): number[] {
  const validation = validateLmpTrackerHeaders(headers);
  if (validation.error) return [];
  const target = normalized(lmpCode);
  if (!target) return [];
  return rows.flatMap((row, index) =>
    index > 0 && normalized(row?.[validation.lmpIdColumn]) === target ? [index] : []
  );
}

export function findCompactableLmpBlankRows(headers: unknown[], rows: unknown[][]): number[] {
  const validation = validateLmpTrackerHeaders(headers);
  if (validation.error) return [];

  const isBlankTemplateRow = (row: unknown[]) => row.every((cell) => {
    const value = normalized(cell);
    return value === "" || value === "false";
  });
  let lastMeaningfulIndex = 0;
  for (let index = 1; index < rows.length; index++) {
    if (!isBlankTemplateRow(rows[index] ?? [])) lastMeaningfulIndex = index;
  }

  const blankSheetRows: number[] = [];
  for (let index = 1; index < lastMeaningfulIndex; index++) {
    if (isBlankTemplateRow(rows[index] ?? [])) {
      blankSheetRows.push(LMP_TRACKER_HEADER_ROW + index);
    }
  }
  return blankSheetRows;
}

export function buildLmpSheetIntegrityReport(headers: unknown[], rows: unknown[][]) {
  const validation = validateLmpTrackerHeaders(headers);
  const companyCol = headers.findIndex((h) => normalized(h) === "company");
  const roleCol = headers.findIndex((h) => normalized(h) === "role");
  const idCol = validation.error ? validation.matches[0] ?? -1 : validation.lmpIdColumn;
  const ids = new Map<string, number[]>();
  const missingLmpIdRows: number[] = [];
  const companyRoleWithoutLmpId: Array<{ row: number; company: string; role: string }> = [];

  for (let i = 1; i < rows.length; i++) {
    const sheetRow = LMP_TRACKER_HEADER_ROW + i;
    const id = idCol === -1 ? "" : String(rows[i]?.[idCol] ?? "").trim();
    if (id) {
      const key = normalized(id);
      ids.set(key, [...(ids.get(key) ?? []), sheetRow]);
      continue;
    }
    const company = companyCol === -1 ? "" : String(rows[i]?.[companyCol] ?? "").trim();
    const role = roleCol === -1 ? "" : String(rows[i]?.[roleCol] ?? "").trim();
    const hasAnyValue = rows[i]?.some((cell) => String(cell ?? "").trim() !== "");
    if (hasAnyValue) missingLmpIdRows.push(sheetRow);
    if (company || role) companyRoleWithoutLmpId.push({ row: sheetRow, company, role });
  }

  return {
    safeToWrite: !validation.error,
    headerError: validation.error ?? null,
    headerDrift: getLmpTrackerHeaderDrift(headers),
    lmpIdHeaderColumns: validation.matches.map((index) => index + 1),
    duplicateLmpIds: [...ids.entries()]
      .filter(([, sheetRows]) => sheetRows.length > 1)
      .map(([lmpId, sheetRows]) => ({ lmpId, sheetRows })),
    missingLmpIdRows,
    companyRoleWithoutLmpId,
    compactableBlankRows: findCompactableLmpBlankRows(headers, rows),
  };
}
