# LMP Tracker — Sheet ↔ DB Column Mapping

Tab: **LMP Tracker** · Header row: **15** · Target table: `public.lmp_processes`

Headers are normalized at ingest (whitespace collapsed to a single space, trimmed),
so the lookup keys below match the visible headers in the sheet.

| Col | Sheet header                       | DB column (`lmp_processes`)                 | Sheet → DB | DB → Sheet |
|-----|------------------------------------|---------------------------------------------|:---------:|:----------:|
| A   | Date                               | `date`                                      | ✅        | ✅ (insert) |
| B   | Company                            | `company`                                   | ✅        | ✅          |
| C   | Role                               | `role`                                      | ✅        | ✅          |
| D   | Domain                             | `domain_raw` (+ resolved `domain_id`)       | ✅        | ✅          |
| E   | Status                             | `status`                                    | ✅        | ✅          |
| F   | Type                               | `type`                                      | ✅        | ✅          |
| G   | Daily Progress                     | `daily_progress`                            | ✅        | ✅          |
| H   | Prep Doc Shared                    | `prep_doc_shared` (bool)                    | ✅        | ✅          |
| I   | Mentor Aligned                     | `mentor_aligned` (bool)                     | ✅        | ✅          |
| J   | Assignment Review                  | `assignment_review` (bool)                  | ✅        | ✅          |
| K   | 1:1 mock completed                 | `one_to_one_mock` (bool)                    | ✅        | ✅          |
| L   | Next Expected Progress (Date)      | `next_progress_date`                        | ✅        | ✅          |
| M   | Next Expected Progress Type        | `next_progress_type`                        | ✅        | ✅          |
| N   | R1 Shortlisted                     | `r1_shortlisted`                            | ✅        | ✅          |
| O   | R2 Shortlisted                     | `r2_shortlisted`                            | ✅        | ✅          |
| P   | R3 Shortlisted                     | `r3_shortlisted`                            | ✅        | ✅          |
| Q   | Final Convert                      | `final_convert`                             | ✅        | ✅          |
| R   | Converted Name(s)                  | `convert_names`                             | ✅        | ✅          |
| S   | Prep Doc                           | `prep_doc`                                  | ✅        | ✅          |
| T   | Prep POC                           | `prep_poc` (+ `prep_poc_id`)                | ✅        | ✅          |
| U   | Support POC                        | `support_poc` (+ `support_poc_id`)          | ✅        | ✅          |
| V   | Outreach POC                       | `outreach_poc` (+ `outreach_poc_ids`)       | ✅        | ✅          |
| W   | Closing Date                       | `closing_date`                              | ✅        | ✅          |
| X   | Mentor Selected                    | `mentor_selected`                           | ✅        | ✅          |
| Y   | Rating                             | _(derived from `sessions.mentor_rating`)_   | n/a       | n/a         |
| Z   | JD                                 | `jd_url` (if URL) / `jd_label`              | ✅        | ✅          |
| AA  | LMP ID                             | `lmp_code`                                  | ✅        | ✅          |

## Sync mechanics

- **DB → Sheet**: any write to `lmp_processes` enqueues a row in `sheet_sync_events`.
  The in-app queue flush (`src/lib/sheets/sheetWriteQueue.ts`) and the
  `sheets-retry-sweeper` cron drain it within seconds.
- **Sheet → DB**: `supabase/functions/sync-ingest` reads `'LMP Tracker'!A15:ZZ10000`,
  normalizes headers, and upserts on `lmp_code` (column AA) when present. Falls
  back to `(company, role)` only for legacy rows with no LMP ID — and logs a
  warning if that fallback matches more than one DB row. Triggered manually via
  "Sync All" or on a schedule.
- **Bool encoding**: DB stores boolean; sheet stores `"Yes"` for `true`, blank for `false`.
- **Date encoding**: sheet `DD/MM/YYYY` → DB `YYYY-MM-DD`.

## Out of scope

- Sheet `Rating` (Y) has no direct column — it is recomputed from `sessions` via
  `recompute_mentor_feedback`.
- True push from Sheets → webhook (Apps Script `onEdit`) is not wired; sheet → DB
  is sweep-based.
