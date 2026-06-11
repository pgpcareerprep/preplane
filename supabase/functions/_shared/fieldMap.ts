/**
 * Canonical sheet column ↔ lmp_processes column map.
 *
 * SINGLE SOURCE OF TRUTH consumed by Deno Edge Functions and the frontend.
 *
 * LMP Tracker sync is DB → Sheet for the canonical A:AA layout. Sheet headers
 * are not created or moved automatically.
 */
export const SHEET_TO_DB: Record<string, string> = {
  // Both spellings accepted — live sheet uses "Comments" (plural); kept
  // "Comment" (singular) for sheets that haven't been renamed yet.
  Comment:  "comments",
  Comments: "comments",
};

export const DB_TO_SHEET: Record<string, string> = {
  date: "Date",
  company: "Company",
  role: "Role",
  domain_raw: "Domain",
  status: "Status",
  type: "Type",
  daily_progress: "Daily Progress",
  prep_doc_shared: "Prep Doc Shared",
  mentor_aligned: "Mentor Aligned",
  assignment_review: "Assignment Review",
  one_to_one_mock: "1:1 mock completed",
  next_progress_date: "Next Progress Date",
  next_progress_type: "Next Progress Type",
  r1_shortlisted: "R1 Shortlisted",
  r2_shortlisted: "R2 Shortlisted",
  r3_shortlisted: "R3 Shortlisted",
  final_convert: "Offer",
  convert_names: "Converted Name(s)",
  prep_doc: "Prep Doc",
  prep_poc: "Prep POC",
  support_poc: "Support POC",
  outreach_poc: "Outreach POC",
  closing_date: "Closing Date",
  mentor_selected: "Mentor Selected",
  mentor_rating: "Mentor Rating",
  lmp_code: "LMP ID",
  jd_url: "JD",
  // Columns added after initial sheet layout — resolved dynamically so they
  // write only when the actual header exists in the live sheet.
  prep_doc_link: "Prep Doc Link",
  comments: "Comments",
};

/**
 * DB status slug → exact label used in the Google Sheet dropdown.
 * Keep these values byte-identical to the sheet's Data Validation list so
 * the sheet keeps its color coding and dropdown rendering after a write.
 */
export const DB_STATUS_TO_SHEET: Record<string, string> = {
  "not-started":    "Not Started",
  "prep-ongoing":   "Prep Ongoing",
  "prep-done":      "Prep Done",
  "hold":           "On hold",
  "on-hold":        "On hold",
  "converted":      "Converted",
  "not-converted":  "Not Converted",
  "other-reasons":  "Other reasons",
  // Legacy DB values → collapse onto active labels
  "ongoing":        "Prep Ongoing",
  "dormant":        "On hold",
  "closed":         "Not Converted",
  "offer-received": "Converted",
  "converted-na":   "Not Converted",
};

/** Exact sheet dropdown label → canonical DB slug. */
export const SHEET_STATUS_TO_DB: Record<string, string> = {
  "Not Started": "not-started",
  "Prep Ongoing": "prep-ongoing",
  "Prep Done": "prep-done",
  "Hold": "hold",
  "On hold": "hold",
  "On Hold": "hold",
  "Converted": "converted",
  "Not Converted": "not-converted",
  "Other Reasons": "other-reasons",
  "Other reasons": "other-reasons",
};

/** Normalize any stored status form to the canonical sheet dropdown label. */
export function normalizeStatusForSheet(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "Not Started";
  const key = s.toLowerCase().replace(/\s+/g, "-");
  return DB_STATUS_TO_SHEET[key] ?? s;
}

/**
 * Sheet → DB conversion is restricted to fields declared in `SHEET_TO_DB`
 * (currently just the `Comment` column, which is bidirectional).
 */
export function sheetPatchToDbPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [sheetCol, val] of Object.entries(patch)) {
    const dbCol = SHEET_TO_DB[sheetCol];
    if (dbCol) out[dbCol] = val;
  }
  return out;
}
