// Identity helpers for the LMP Tracker sheet: detect blank/template rows so
// the compaction pass in sheets-lmp only removes truly empty rows (no company,
// role, or LMP ID) and never touches data rows that happen to have empty
// checkboxes, dropdown defaults, or formula-generated values.

export const LMP_TRACKER_HEADER_ROW = 15;

function validateLmpTrackerHeaders(headers: unknown[]): { error?: string } {
  const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const hasCompany = headers.some((h) => norm(h) === "company");
  const hasRole = headers.some((h) => norm(h) === "role");
  if (!hasCompany || !hasRole) {
    return { error: `Required headers missing — company:${hasCompany}, role:${hasRole}` };
  }
  return {};
}

// A row is compactable (deletable blank) only when all three identity fields
// are empty. Checkbox defaults ("false"), formula-only cells, and dropdown
// placeholders are ignored — we rely solely on the three identity columns.
function isCompactableTemplateRow(headers: unknown[], row: unknown[]): boolean {
  const normalizedHeader = (value: unknown) =>
    String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

  const companyCol = headers.findIndex((h) => normalizedHeader(h) === "company");
  const roleCol    = headers.findIndex((h) => normalizedHeader(h) === "role");
  const lmpIdCol   = headers.findIndex((h) => normalizedHeader(h) === "lmp id");

  const company = companyCol >= 0 ? String(row?.[companyCol] ?? "").trim() : "";
  const role    = roleCol    >= 0 ? String(row?.[roleCol]    ?? "").trim() : "";
  const lmpId   = lmpIdCol   >= 0 ? String(row?.[lmpIdCol]  ?? "").trim() : "";

  return !company && !role && !lmpId;
}

// Returns the 1-based sheet row numbers of blank rows that sit BETWEEN the
// header and the last meaningful data row. Rows after the last meaningful row
// are not returned because those are not gaps — they're just trailing space.
//
// `rows` is the full valueRange including the header at index 0 (which is
// skipped). Row numbers are offset from LMP_TRACKER_HEADER_ROW so they map
// correctly to the actual spreadsheet row.
export function findCompactableLmpBlankRows(headers: unknown[], rows: unknown[][]): number[] {
  const validation = validateLmpTrackerHeaders(headers);
  if (validation.error) return [];

  let lastMeaningfulIndex = 0;
  for (let index = 1; index < rows.length; index++) {
    if (!isCompactableTemplateRow(headers, rows[index] ?? [])) {
      lastMeaningfulIndex = index;
    }
  }

  const blankSheetRows: number[] = [];
  for (let index = 1; index < lastMeaningfulIndex; index++) {
    if (isCompactableTemplateRow(headers, rows[index] ?? [])) {
      blankSheetRows.push(LMP_TRACKER_HEADER_ROW + index);
    }
  }

  return blankSheetRows;
}
