/**
 * Canonical sheet ↔ DB column map (frontend).
 *
 * MIRROR of `supabase/functions/_shared/fieldMap.ts` — keep byte-identical
 * (modulo import path).
 *
 * ⚠️ LMP Tracker sync is **DB → Sheet** for every field EXCEPT the
 * `Comment` column (col Z), which is bidirectional. Sheet edits to the
 * Comment cell flow back into `lmp_processes.comments`.
 */
export const SHEET_TO_DB: Record<string, string> = {
  // Bidirectional — sheet `Comment` cell mirrors `lmp_processes.comments`.
  Comment: "comments",
};

/**
 * DB column → canonical sheet header. Maps every writable DB field to its
 * column in the LMP Tracker sheet (A–AA, header row 15).
 *
 * | Col | Header              | DB column            |
 * |-----|---------------------|----------------------|
 * | A   | Date                | date                 |
 * | B   | Company             | company              |
 * | C   | Role                | role                 |
 * | D   | Domain              | domain_raw           |
 * | E   | Status              | status               |
 * | F   | Type                | type                 |
 * | G   | Daily Progress      | daily_progress       |
 * | H   | Prep Doc Shared     | prep_doc_shared      |
 * | I   | Mentor Aligned      | mentor_aligned       |
 * | J   | Assignment Review   | assignment_review    |
 * | K   | 1:1 mock completed  | one_to_one_mock      |
 * | L   | Next Progress Date  | next_progress_date   |
 * | M   | Next Progress Type  | next_progress_type   |
 * | N   | R1 Shortlisted      | r1_shortlisted       |
 * | O   | R2 Shortlisted      | r2_shortlisted       |
 * | P   | R3 Shortlisted      | r3_shortlisted       |
 * | Q   | Converted Names     | final_convert        |
 * | R   | Converted Name(s)   | convert_names        |
 * | S   | Prep Doc Link       | prep_doc_link        |
 * | T   | Prep POC            | prep_poc             |
 * | U   | Support POC         | support_poc          |
 * | V   | Outreach POC        | outreach_poc         |
 * | W   | Closing Date        | closing_date         |
 * | X   | Mentor Selected     | mentor_selected      |
 * | Y   | Mentor Rating       | mentor_rating        |
 * | Z   | Comment             | comments (↔ bidi)   |
 * | AA  | LMP ID              | lmp_code             |
 */
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
  prep_doc_link: "Prep Doc Link",
  prep_poc: "Prep POC",
  support_poc: "Support POC",
  outreach_poc: "Outreach POC",
  closing_date: "Closing Date",
  mentor_selected: "Mentor Selected",
  mentor_rating: "Mentor Rating",
  comments: "Comment",
  lmp_code: "LMP ID",
  jd_url: "JD",
};

/**
 * Sheet-header keyed patch → DB-column keyed patch.
 *
 * Used by app-originated writes that first round-trip through `toSheetPatch`
 * (so the input keys are guaranteed to be canonical sheet headers from
 * `DB_TO_SHEET`). Sheet → DB *sync* remains disabled — this helper only
 * exists to translate the in-app patch shape back to DB columns.
 */
const SHEET_HEADER_TO_DB: Record<string, string> = Object.fromEntries(
  Object.entries(DB_TO_SHEET).map(([db, header]) => [header, db]),
);

const SHEET_STATUS_TO_DB: Record<string, string> = {
  "Not Started":    "not-started",
  "Prep Ongoing":   "prep-ongoing",
  "Prep Done":      "prep-done",
  "Hold":           "hold",
  "On hold":        "hold",
  "On Hold":        "hold",
  "Converted":      "converted",
  "Not Converted":  "not-converted",
  "Other Reasons":  "other-reasons",
  "Other reasons":  "other-reasons",
};

/** DB slug → exact sheet dropdown label (kept in sync with backend fieldMap). */
export const DB_STATUS_TO_SHEET: Record<string, string> = {
  "not-started":    "Not Started",
  "prep-ongoing":   "Prep Ongoing",
  "prep-done":      "Prep Done",
  "hold":           "On hold",
  "on-hold":        "On hold",
  "converted":      "Converted",
  "not-converted":  "Not Converted",
  "other-reasons":  "Other reasons",
  "ongoing":        "Prep Ongoing",
  "dormant":        "On hold",
  "closed":         "Not Converted",
  "offer-received": "Converted",
  "converted-na":   "Not Converted",
};

export function sheetPatchToDbPatch(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(patch)) {
    const col = SHEET_HEADER_TO_DB[header];
    if (!col) continue;
    if (col === "status" && typeof value === "string") {
      out.status = SHEET_STATUS_TO_DB[value] ?? value;
      continue;
    }
    out[col] = value;
  }
  return out;
}

