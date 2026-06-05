## Root causes

1. **Secondary Domain shows "Unmapped"** — `studentUpload.ts` passes a `string[]` to the TEXT column `students.other_domains`, so Supabase stores it as JSON: `["Sales"]`. The modal's `renderSecondary` splits on `,;|` and never strips brackets/quotes, so `domainDisplay("[\"Sales\"]")` resolves to "Unmapped".
2. **Program Name shows "—"** — `ViewAllStudentsModal.deriveProgram(s.roll_no)` derives program from the roll_no prefix. New uploads have no roll_no (CSV doesn't include one — `student_code` is auto-generated as STU-xxxxx), and the CSV's "Program Name" column is mapped into `students.cohort`, which the modal never reads.

## Fix end-to-end

### A. CSV upload — store other_domains as a clean comma-joined string
`src/lib/studentUpload.ts`: in the `other_domains` branch, after `normalizeDomainList(...)` returns a `string[]`, join with `, ` before assigning to `rec[dbField]` so the DB stores `"Sales"` / `"Sales, Marketing"`, not `["Sales"]`.

### B. All Students modal — pull Program Name from cohort, fall back to roll_no
`src/components/datasources/ViewAllStudentsModal.tsx`:
- Change `deriveProgram` (or its call site) to prefer `s.cohort` when present (uppercased, mapped: PGP/TBM stays TBM, YLC stays YLC, others passthrough), then fall back to the roll_no prefix.
- Also extend `renderSecondary` to defensively strip JSON brackets/quotes from legacy values so old rows render correctly even before the heal runs.

### C. Heal existing rows
One-time UPDATE on `students.other_domains`:
- Where value looks like `["..."]`, parse the JSON and rewrite as the comma-joined plain text.

No schema/migration needed (column is already TEXT). No edge-function changes — students don't sync to Sheets the way LMPs do.

## Files
- `src/lib/studentUpload.ts` (join array → string)
- `src/components/datasources/ViewAllStudentsModal.tsx` (Program Name from cohort, defensive parse on Secondary Domain)
- Data heal via insert tool: rewrite JSON-array `other_domains` to plain text.