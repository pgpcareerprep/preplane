/**
 * Schema constants for the LMP Google Sheet.
 * Spreadsheet ID: configured via LMP_SPREADSHEET_ID secret.
 *
 * ⚠️ DO NOT rename headers in the sheet without updating this file.
 * Tab names with spaces are handled via batchGet/batchUpdate (body-based ranges).
 */

// ─── Tab names ───
export const TABS = {
  // Operational (bidirectional)
  LMP_TRACKER: "LMP Tracker",

  // Reference / read-only
  MASTERSHEET: "Mastersheet",
  STUDENT_DATA: "Student Data",
  DASHBOARD: "Dashboard",
  INDEX: "Index",
  BEHAVIORAL: "Behavioral",
  MOCK_SCORES: "Mock Scores",
  INDIVIDUAL_PREP: "Individual Prep Readiness",
  MENTOR_LOOKUP: "Mentor Lookup",
  STUDENT_TRACKER: "Student Tracker",
  REMOTE_RECORDINGS: "Remote Recordings",
  REPORT_CARD: "Report Card",
  HIT_RATE: "Hit Rate",

  // POD sheets
  POD_FINANCE: "POD - Finance",
  POD_CONSULTING: "POD - Consulting",
  POD_PRODUCT_MGMT: "POD - Product Mgmt",
  POD_FOCOS: "POD - FOCOS",
  POD_DATA: "POD - Data",
  POD_MARKETING: "POD - Marketing",
  POD_SALES: "POD - Sales",
  POD_SUPPLY_CHAIN: "POD - Supply Chain",
  POD_HR: "POD - HR",

  // INPUT sheets
  INPUT_BEHAVIORAL: "INPUT - Behavioral",
  INPUT_FINANCE: "INPUT - Finance",
  INPUT_CONSULTING: "INPUT - Consulting",
  INPUT_PRODUCT_MGMT: "INPUT - Product Mgmt",
  INPUT_FOCOS: "INPUT - FOCOS",
  INPUT_DATA: "INPUT - Data",
  INPUT_MARKETING: "INPUT - Marketing",
  INPUT_SALES: "INPUT - Sales",
  INPUT_SUPPLY_CHAIN: "INPUT - Supply Chain",
  INPUT_HR: "INPUT - HR",
} as const;

export type TabName = (typeof TABS)[keyof typeof TABS];

// ─── Header row positions ───
// Mastersheet has a section header in row 1; actual column headers are in row 2.
// All other tabs use row 1 as headers.
export const HEADER_ROWS: Partial<Record<TabName, number>> = {
  [TABS.MASTERSHEET]: 2,
  [TABS.LMP_TRACKER]: 14,
};

export function getHeaderRow(tab: TabName): number {
  return HEADER_ROWS[tab] ?? 1;
}

// ─── LMP Tracker headers (actual sheet columns, row 14 headers) ───
// Canonical layout matches the live tracker (33 columns, A–AG).
// Sheet headers are never mutated automatically. An ambiguous or misaligned
// identity column blocks writes until an admin repairs the sheet manually.
export const LMP_TRACKER_HEADERS = [
  /* A */ "Date",
  /* B */ "Company",
  /* C */ "Role",
  /* D */ "Domain",
  /* E */ "Status",
  /* F */ "Type",
  /* G */ "Daily Progress",
  /* H */ "Prep Doc Shared",
  /* I */ "Mentor Aligned",
  /* J */ "Assignment Review",
  /* K */ "1:1 mock completed",
  /* L */ "Next Progress Date",
  /* M */ "Next Progress Type",
  /* N */ "Shortlisted (Pool) - Number",
  /* O */ "Shortlisted (Pool) - Name(s)",
  /* P */ "R1 - Numbers",
  /* Q */ "R1 - Names",
  /* R */ "R2 - Numbers",
  /* S */ "R2 - Names",
  /* T */ "R3 - Numbers",
  /* U */ "R3 - Names",
  /* V */ "Final Converted Numbers",
  /* W */ "Converted Names",
  /* X */ "Prep Doc Link",
  /* Y */ "Prep POC",
  /* Z */ "Support POC",
  /* AA */ "Outreach POC",
  /* AB */ "Closing Date",
  /* AC */ "Mentor Selected",
  /* AD */ "Mentor Rating",
  /* AE */ "Feedback by outreach",
  /* AF */ "Comments",
  /* AG */ "LMP ID",
] as const;

// ─── Mastersheet headers (read-only reference) ───
export const MASTERSHEET_HEADERS = [
  "Roll No.", "Name", "Converted Placement Status", "Internship", "Live Project",
  "Primary Domain", "Resume 1", "Secondary Domain", "Resume 2",
  "Actual Domain", "Other Suitable Domains", "Keywords",
  "Mentor (Primary)", "Mentor (Secondary)",
  "Mock Score", "Resume Score", "Practicum", "Behavioral", "Beh. Resume",
  "Video CV", "Portfolio", "Composite (Primary)",
  "IV Attempts", "Interview Risk Flag",
  "Mock Score (S)", "Resume Score (S)", "Practicum (S)", "Behavioral (S)",
  "Beh. Resume (S)", "Video CV (S)", "Portfolio (S)", "Composite (Secondary)",
] as const;

// ─── Tabs that are writable (operational) ───
export const WRITABLE_TABS: TabName[] = [TABS.LMP_TRACKER];

// ─── Tabs that are read-only (reference) ───
export const READONLY_TABS: TabName[] = [
  TABS.MASTERSHEET, TABS.DASHBOARD, TABS.INDEX, TABS.BEHAVIORAL,
  TABS.MOCK_SCORES, TABS.INDIVIDUAL_PREP, TABS.MENTOR_LOOKUP,
  TABS.STUDENT_TRACKER, TABS.REMOTE_RECORDINGS, TABS.REPORT_CARD,
  TABS.HIT_RATE,
  // POD sheets
  TABS.POD_FINANCE, TABS.POD_CONSULTING, TABS.POD_PRODUCT_MGMT,
  TABS.POD_FOCOS, TABS.POD_DATA, TABS.POD_MARKETING,
  TABS.POD_SALES, TABS.POD_SUPPLY_CHAIN, TABS.POD_HR,
  // INPUT sheets
  TABS.INPUT_BEHAVIORAL, TABS.INPUT_FINANCE, TABS.INPUT_CONSULTING,
  TABS.INPUT_PRODUCT_MGMT, TABS.INPUT_FOCOS, TABS.INPUT_DATA,
  TABS.INPUT_MARKETING, TABS.INPUT_SALES, TABS.INPUT_SUPPLY_CHAIN,
  TABS.INPUT_HR,
];
