# LMP Tracker — Sheet ↔ DB Column Mapping

Tab: **LMP Tracker** · Header row: **14** · First data row: **15** · Target table: `public.lmp_processes`

Headers are normalized at ingest (whitespace collapsed to a single space, trimmed),
so newline variants still resolve. The LMP identity column must remain **AG / LMP ID**.

| Col | Sheet header | Source / DB column | Sheet → DB | DB → Sheet |
|-----|--------------|--------------------|:---------:|:----------:|
| A | Date | `date` | ✅ | ✅ |
| B | Company | `company` | ✅ | ✅ |
| C | Role | `role` | ✅ | ✅ |
| D | Domain | `domain_raw` (+ resolved `domain_id`) | ✅ | ✅ |
| E | Status | `status` | ✅ | ✅ |
| F | Type | `type` | ✅ | ✅ |
| G | Daily Progress | `daily_progress` / latest log | ✅ | ✅ |
| H | Prep Doc Shared | `prep_doc_shared` | ✅ | ✅ |
| I | Mentor Aligned | `mentor_aligned` | ✅ | ✅ |
| J | Assignment Review | `assignment_review` | ✅ | ✅ |
| K | 1:1 mock completed | `one_to_one_mock` | ✅ | ✅ |
| L | Next Progress Date | `next_progress_date` | ✅ | ✅ |
| M | Next Progress Type | `next_progress_type` | ✅ | ✅ |
| N | Shortlisted (Pool) - Number | `lmp_full_view.pool_count` | n/a | ✅ |
| O | Shortlisted (Pool) - Name(s) | `lmp_full_view.pool_names` | n/a | ✅ |
| P | R1 - Numbers | `lmp_full_view.r1_count` | n/a | ✅ |
| Q | R1 - Names | `lmp_full_view.r1_names` | n/a | ✅ |
| R | R2 - Numbers | `lmp_full_view.r2_count` | n/a | ✅ |
| S | R2 - Names | `lmp_full_view.r2_names` | n/a | ✅ |
| T | R3 - Numbers | `lmp_full_view.r3_count` | n/a | ✅ |
| U | R3 - Names | `lmp_full_view.r3_names` | n/a | ✅ |
| V | Final Converted Numbers | `lmp_full_view.converted_count` | n/a | ✅ |
| W | Converted Names | `lmp_full_view.converted_names` | n/a | ✅ |
| X | Prep Doc Link | `prep_doc_link` | ✅ | ✅ |
| Y | Prep POC | `prep_poc` / `lmp_full_view.prep_poc_names` | ✅ | ✅ |
| Z | Support POC | `support_poc` / `lmp_full_view.support_poc_names` | ✅ | ✅ |
| AA | Outreach POC | `outreach_poc` / `lmp_full_view.outreach_poc_names` | ✅ | ✅ |
| AB | Closing Date | `closing_date` | ✅ | ✅ |
| AC | Mentor Selected | `lmp_full_view.mentor_name` | ✅ | ✅ |
| AD | Mentor Rating | `lmp_full_view.mentor_feedback_avg` | n/a | ✅ |
| AE | Feedback by outreach | `feedback_by_outreach` | ✅ | ✅ |
| AF | Comments | `comments` | ✅ | ✅ |
| AG | LMP ID | `lmp_code` | ✅ | ✅ |

## Sync Mechanics

- **DB → Sheet**: writes enqueue `sheet_write_queue` jobs. The authenticated
  `sheets-retry-sweeper` worker calls `sheets-lmp`, which writes the row and
  verifies pipeline cells against `lmp_full_view` before marking the job done.
- **Sheet identity**: `sheets-lmp` dynamically locates `LMP ID`, but the
  canonical header must be in AG. Missing, duplicate, or misaligned identity
  headers block writes instead of appending unsafe duplicate rows.
- **Pipeline source of truth**: Pool/R1/R2/R3/Converted counts and names come
  from `public.lmp_full_view`, not stale queued payload fields.
- **Sheet → DB**: only approved fields are pulled back. Pipeline counts/names
  are DB-owned and are rewritten from candidate rows.
