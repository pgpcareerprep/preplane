# Prep POC Heatmap — Full Redesign Prompt

Use this prompt to redesign and implement the **Prep POC Heatmap** tab inside the PrepLane Admin Dashboard (`/dashboard`). This is a **frontend-only** task: do **not** change Supabase schema, edge functions, RLS, or business logic unless explicitly noted as a data-filter fix.

---

## Product context

**PrepLane** is an AI-powered career prep operations platform. The Prep POC Heatmap gives admins and allocators a live, at-a-glance view of **Prep POC workload, preparation pipeline stage, closed outcomes, ownership, domain load, and conversion performance** — one row per Prep POC, with drill-down into underlying LMPs and students.

**Placement:** Admin Dashboard → scroll to **POC ANALYTICS → Prep POC Heatmap** card (`PrepPocHeatmapCard.tsx` on `AdminLmpDashboard`).

**Data sources (live, not hardcoded):**
- `poc_profiles` — active Prep POCs
- `lmp_poc_links` — prep/support assignments (must filter `is_active = true`)
- `lmp_processes` + `domains`
- `lmp_candidates` + `students`
- Realtime invalidation on all four tables
- Aggregation: `src/lib/prepPocHeatmapAgg.ts` → `buildHeatmapData()`

---

## Design system — Lumina v1.0

Follow the **Lumina Design System** (warm neutrals, orange primary `#E38330`, yellow secondary `#F7D344`, semantic sage/coral/sky/plum/teal).

| Token | Use |
|-------|-----|
| `--lx-bg` / `--lx-surface` | Card and table backgrounds |
| `--lx-border` | Borders `#E8E5DC` |
| `--lx-text`, `--lx-text-2`, `--lx-text-3` | Primary / secondary / muted text |
| `--lx-orange`, `--lx-yellow`, `--lx-success`, `--lx-risk`, `--lx-info`, `--lx-ai` | Accents |
| Typography | Plus Jakarta Sans (body/UI); Fraunces italic for accent only (never in table cells) |
| Layout | **36px horizontal gutter** from sidebar and viewport edge (via AppShell `px-gutter`); card uses **full available width** — no `max-w-dashboard` centering |
| Dark mode | Warm dark: page `#1A1916`, cards `#2A2822`; all heat cells and KPIs must remain readable (WCAG AA) |
| Tables | **No blur** on data-dense surfaces; flat backgrounds only |
| Modals | Backdrop blur 20px, warm overlay `rgba(26,25,22,0.7)` |

---

## Current UI structure (from screenshot + code)

### Card chrome
- **Eyebrow:** `POC ANALYTICS` (orange, uppercase, 11px)
- **Title:** `Prep POC Heatmap` (24px bold)
- **Subtitle:** *Live workload, preparation stage, outcomes and ownership by Prep POC.*
- **Status line:** `Live from POC DB • LMP DB` + green **Live** pill (pulses when refetching; error state when fetch fails)

### Top-right controls
1. **View tabs (segmented control):**
   - `LMP-wise` — **active, implemented**
   - `Student-wise` — disabled, label "Not yet implemented"
   - `Domain-wise` — disabled, label "Not yet implemented"
2. **Columns** popover — toggle section visibility (persisted in `localStorage` key `heatmap_visible_sections_v1`)
3. **Export CSV** — full dataset export regardless of visible columns

### KPI summary row (4 cards, horizontal)
| Card | Value source | Tooltip intent |
|------|--------------|----------------|
| Active POCs | `summary.activePocCount` | Distinct active POCs with ≥1 LMP assignment |
| Unique LMPs | `summary.uniqueLmpCount` | Globally distinct LMPs (deduped across POCs) |
| Students Placed | `summary.uniqueStudentsPlaced` | Globally distinct placed students |
| Converted LMP % | `summary.convertedLmpPercentage` | Global converted ÷ eligible closed (excludes On Hold) |

**Required:** Each KPI card must be **clickable** and open a **drill-down modal** listing the entities behind that number (reuse or extend `HeatmapDrilldownModal` with global/summary scope — e.g. `pocId: "*"` or dedicated summary metric keys).

### Heatmap table

**Row axis:** Prep POC name (only POCs with `totalLmpLoad > 0`)

**Column groups** (each with colored top border, optional hide via Columns popover):

| Group | Accent | Columns |
|-------|--------|---------|
| **LMP LOAD** | Amber | Total (Till Today), Current (Ongoing), Closed |
| **ACTIVE PREP** | Blue | Not Started, Prep Ongoing, Prep Done, **On Hold** |
| **CLOSED OUTCOMES** | Green / Red / Orange | Converted, Not Converted, Other Reasons |
| **RESPONSIBILITY** | Indigo | Primary, Support |
| **DOMAIN LOAD** | Teal | In-domain, Cross-domain |
| **PERFORMANCE** | Dark green | LMP Conversion (ratio + %), Students Placed |

**Heat intensity:** 5-level scale relative to **column max** (0 → 1–25% → 26–50% → 51–75% → 76–100%). Soft pastel fills; dark text on filled cells; muted text on zero cells. **Never use blur on table cells.**

**Performance column:** Display as `converted/eligible — XX%` (e.g. `2/4 — 50%`). Color-code percentage (red 0%, green 100%, gradient between).

**TOTAL row:** Bold summary at bottom. Footer legend: *Heat intensity (relative to column max) Low → High* (5 gradient dots).

**Do NOT show** the old footer note: *"On Hold shown under Active Prep · load & conversion calculations unchanged"* — it was removed intentionally.

---

## Interaction requirements

### Cell drill-down (already exists — preserve and polish)
- Click any **non-zero heat cell** → modal with:
  - POC name, metric label, displayed count
  - Search, column sort, pagination (25/page)
  - LMP table: company, role, domain, status, POCs, dates → **View** navigates to `/lmp/:id`
  - Student table for student-placement metrics
  - CSV export of drill-down list
  - **Count mismatch warning** if modal list count ≠ cell display count

### KPI drill-down (must add)
- Click **Active POCs** → list all active POCs with load summary
- Click **Unique LMPs** → all distinct LMPs in scope
- Click **Students Placed** → student list with placement details
- Click **Converted LMP %** → converted vs eligible closed LMP breakdown

### TOTAL row drill-down (optional enhancement)
- Make TOTAL cells clickable where a global list is meaningful (e.g. total Converted → all converted LMPs globally)

### Column visibility
- Columns popover: checkboxes per section group; **Show all** reset
- Hidden sections collapse entirely (colgroup, headers, body, totals stay in sync via single `SECTION_CONFIG`)

### Export
- CSV includes all rows + summary metadata + export timestamp
- Respects full dataset (not filtered by visible columns)

---

## Data & calculation rules (must be correct and consistent)

### Live data only
All numbers come from `buildHeatmapData()` — **no hardcoded KPI values**.

### Active links filter
Query `lmp_poc_links` with `.eq("is_active", true)` in addition to `.in("role", ["prep", "support"])` to match operational dashboards.

### On Hold placement
- **Visual:** On Hold column lives under **ACTIVE PREP** (blue family), not Closed Outcomes
- **Logic:** On Hold LMPs are **excluded from conversion denominator**; load calculations unchanged

### TOTAL row — known bug to fix
**Problem:** Per-POC **Converted** column sums can exceed TOTAL **Converted** (e.g. rows sum to 5, TOTAL shows 4) because:
- Row values = POC-attributed counts (same LMP can appear on multiple POC rows)
- TOTAL uses `summary.convertedLmpCount` = **globally deduplicated** count

**Fix direction (pick one, document in UI):**
1. **Recommended:** TOTAL row uses **consistent semantics** — label deduplicated columns (Converted, Unique LMPs, Students Placed) with a subtle `(unique)` hint; Performance TOTAL uses same global converted + eligible counts; OR
2. Sum row values for POC-attributed columns and add footnote *"POC-attributed totals may overlap when LMPs are shared"*

Same pattern applies to `totalLmpLoad` TOTAL vs row sums.

### Reconciliation tests
Extend `src/test/prepPocHeatmapAgg.test.ts` for multi-POC shared LMP scenarios.

---

## View modes (future — scaffold in UI)

### LMP-wise (current)
Implemented as described above.

### Student-wise (not yet implemented)
- Row axis: students (or student × POC?)
- Columns: prep stage, LMP assignment, outcome, POC ownership
- Same heat + drill-down patterns

### Domain-wise (not yet implemented)
- Row axis: domains
- Columns: POC load, conversion by domain, cross-domain share
- Align with `DomainConversionCells` / domain allocation views

When disabled, tabs show reduced opacity + tooltip *"Not yet implemented"* — do not remove tab UI.

---

## Visual polish checklist

- [ ] Full card width within 36px gutters; horizontal scroll for table on narrow viewports
- [ ] Sticky POC name column on horizontal scroll
- [ ] Section header icons (ClipboardList, RefreshCw, TrendingUp, Users, Briefcase, BarChart3)
- [ ] Eye-off affordance on hidden sections in Columns popover
- [ ] Loading skeleton matches KPI + table shape
- [ ] Error state with **Retry** button
- [ ] Empty state when no POCs have load
- [ ] `noSections` state when all column groups hidden — prompt to show columns
- [ ] KPI cards: hover/focus ring, cursor pointer when drill-down enabled
- [ ] Dark mode: heat palettes remain distinguishable; borders visible on `#2A2822`

---

## Files to touch (implementation guide)

| File | Role |
|------|------|
| `src/components/dashboard/PrepPocHeatmapCard.tsx` | UI, KPI cards, table, modals, export |
| `src/lib/prepPocHeatmapAgg.ts` | Aggregation, summary totals, drill-down filters |
| `src/test/prepPocHeatmapAgg.test.ts` | Calculation reconciliation tests |
| `src/components/insights/primitives.tsx` | Shared Lumina tokens (if needed) |
| `src/index.css` | `--lx-*` tokens, dark overrides |

**Do not modify:** Supabase migrations, edge functions, role gates, dashboard routing logic.

---

## Acceptance criteria

1. All KPI and table values are **live from DB** with realtime refresh
2. **36px** side padding matches other dashboard views; heatmap uses **full content width**
3. Lumina tokens, typography, and dark theme applied consistently
4. KPI cards + table cells open **drill-down modals** with search, sort, pagination, CSV
5. TOTAL row math is **internally consistent** with documented dedupe vs sum semantics
6. On Hold footer note **absent**; On Hold column under Active Prep **present**
7. `is_active = true` on `lmp_poc_links` query
8. Export CSV, column visibility, and LMP-wise view fully functional
9. Student-wise / Domain-wise tabs visible but disabled with clear messaging
10. No regression in existing drill-down LMP navigation or count-mismatch warnings

---

## Example agent instruction (copy-paste)

```
Redesign the Prep POC Heatmap tab in PrepLane per docs/PrepPocHeatmap_Redesign_Prompt.md.

Scope: frontend only. Use Lumina v1.0 design tokens, 36px gutters, full-width layout.

Must implement:
- Clickable KPI drill-down modals (Active POCs, Unique LMPs, Students Placed, Converted LMP %)
- Fix TOTAL row vs column sum inconsistency for Converted / Performance (document dedupe semantics)
- Add is_active=true filter on lmp_poc_links query
- Preserve cell drill-down, CSV export, column visibility, realtime, and heat scale
- Remove any On Hold footer note; keep On Hold under Active Prep
- Dark mode + WCAG AA readability on all heat cells

Do not change backend schema or business logic beyond the is_active query filter.
Add/extend tests in prepPocHeatmapAgg.test.ts for shared-LMP dedupe cases.
```

---

*Last updated: June 2026 — reflects PrepLane dashboard state after Lumina design system pass and 36px gutter layout fix.*
