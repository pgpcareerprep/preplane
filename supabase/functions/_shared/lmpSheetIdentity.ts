export type LmpSheetRowLookup = {
  rowIndex: number;
  lmpIdColumn: number;
  matches: number[];
  /** Column index where "LMP ID" was actually found when it differs from LMP_ID_COLUMN_INDEX. */
  lmpIdColumnActual?: number;
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
  "R3 Shortlisted", "Offer", "Converted Name(s)", "Prep Doc Link", "Prep POC",
  "Support POC", "Outreach POC", "Closing Date", "Mentor Selected",
  "Mentor Rating", "Comments", "LMP ID",
] as const;

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isBlankTemplateRow(row: unknown[]): boolean {
  return row.every((cell) => {
    const value = normalized(cell);
    return value === "" || value === "false";
  });
}

export function getLmpTrackerHeaderDrift(headers: unknown[]) {
  return CANONICAL_LMP_TRACKER_HEADERS.flatMap((expected, index) => {
    const actual = String(headers[index] ?? "");
    return normalized(actual) === normalized(expected)
      ? []
      : [{ column: index + 1, expected, actual }];
  });
}

export function validateLmpTrackerHeaders(headers: unknown[]): Pick<LmpSheetRowLookup, "lmpIdColumn" | "matches" | "error" | "lmpIdColumnActual"> {
  const matches = headers
    .map((header, index) => normalized(header) === "lmp id" ? index : -1)
    .filter((index) => index !== -1);
  if (matches.length === 0) return { lmpIdColumn: -1, matches, error: "MISSING_LMP_ID_HEADER" };
  if (matches.length > 1) return { lmpIdColumn: -1, matches, error: "DUPLICATE_LMP_ID_HEADERS" };
  if (matches[0] !== LMP_ID_COLUMN_INDEX) {
    return {
      lmpIdColumn: -1,
      lmpIdColumnActual: matches[0],
      matches,
      error: "MISALIGNED_LMP_ID_HEADER",
    };
  }
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
    const hasBusinessData = !isBlankTemplateRow(rows[i] ?? []);
    if (hasBusinessData) missingLmpIdRows.push(sheetRow);
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
