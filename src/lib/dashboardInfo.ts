/**
 * Single source of truth for the explanation copy shown by every
 * dashboard "i" info button. Keyed by metric id so copy is consistent
 * across Admin / POC / Allocator views and easy to update in one place.
 */
export const DASHBOARD_INFO = {
  // ── Cross-dashboard hero & filters
  "filters":                       "Adjusts every metric below. Range, Domain, Status, Type, and POC narrow the rows the dashboard summarises.",
  "live-pill":                     "Numbers refresh in real time as the underlying database changes — no reload needed.",

  // ── Admin · Hero / Status
  "admin.hero.in-view":            "Count of LMP processes that match the current filters above (Range, Domain, Status, Type, POC).",
  "admin.hero.overall":            "All LMP processes in the system regardless of filters. Sub-text shows how many of those have a final-conversion record.",
  "admin.hero.conversion":         "Converted ÷ In-view processes. A row counts as Converted when Status = Converted OR a Final Convert name is recorded.",
  "admin.status.donut":            "Share of in-view LMPs by Status. Click a segment to list those processes.",
  "admin.status.strip":            "Per-status count and % of the in-view pipeline. Click any tile to see those LMPs.",

  // ── Snapshot / activity strip
  "snapshot.active-lmps":          "LMPs in Ongoing, Offer Received, or On Hold status — i.e. anything still actively being worked.",
  "snapshot.high-priority":        "LMPs with at least one high-priority flag (overdue, mentor pending 20d+, stale 14d+).",
  "snapshot.overdue":              "Active LMPs past their closing date.",
  "snapshot.update-due-today":     "Active LMPs without a daily progress log recorded today.",
  "snapshot.mentor-20d":           "Active LMPs older than 20 days with no aligned mentor.",
  "snapshot.prep-doc-pending":     "Active LMPs whose prep document has not been marked Sent.",
  "snapshot.mock-pending":         "LMPs in R1/R2/R3/Offer where the POC has not marked the mock as completed.",
  "snapshot.stale-14d":            "Active LMPs with no status update in 14+ days.",

  // ── POC heatmap (admin)
  "admin.heatmap":                 "Each row is an active Prep POC. Columns show that POC's load across LMP lifecycle stages. Click any cell to see the linked LMPs.",
  "admin.heatmap.col.total":       "Total LMPs the POC has been linked to as Prep, regardless of status (historical lifetime count).",
  "admin.heatmap.col.prep-load":   "Active Prep LMPs currently assigned (not yet Converted, Closed, or Rejected).",
  "admin.heatmap.col.support":     "Active LMPs where the POC is the Support POC (not the primary Prep owner).",
  "admin.heatmap.col.in-domain":   "Active Prep load that falls within the POC's primary / tagged domains.",
  "admin.heatmap.col.cross":       "Active Prep load outside the POC's declared domains — context switch cost.",
  "admin.heatmap.col.not-started": "Prep LMPs that haven't begun (placement still Not Started).",
  "admin.heatmap.col.prep-ongoing":"Prep currently in progress.",
  "admin.heatmap.col.prep-done":   "Prep marked complete, candidate handed to outreach / rounds.",
  "admin.heatmap.col.hold":        "Prep LMPs put On Hold.",
  "admin.heatmap.col.converted":   "Successful conversions credited to this POC's Prep ownership.",
  "admin.heatmap.col.not-conv":    "Prep LMPs that closed with a Not Converted outcome.",
  "admin.heatmap.col.other":       "Closed for reasons other than conversion (withdraw, role pulled, etc.).",

  // ── Admin · Domain load
  "admin.domain.bar":              "Active LMPs per domain. Bar length is relative to the most-loaded domain. Click a row to see the LMPs.",
  "admin.domain.chip.total":       "Total LMPs ever opened in this domain (historical).",
  "admin.domain.chip.conv":        "Lifetime conversion rate for the domain.",

  // ── Admin · Student analytics
  "admin.students.total-db":       "All students currently in the Students database, ignoring dashboard filters.",
  "admin.students.in-view":        "Unique student names appearing on any LMP in the current view (parsed from R1/R2/R3/Final/Convert fields).",
  "admin.students.in-process":     "Students with at least one ACTIVE LMP (active_lmp_count ≥ 1) from the live Students DB.",
  "admin.students.single":         "Students with exactly one active LMP.",
  "admin.students.multiple":       "Students with two or more active LMPs simultaneously.",
  "admin.students.inactive":       "Students with zero active LMPs.",
  "admin.students.cohort":         "Per-cohort split of students by active-LMP count.",
  "admin.students.by-domain":      "Unique students grouped by their PRIMARY domain preference (resolved to canonical domain names). Click a row to list those students.",
  "admin.students.converted":      "Unique students listed under Converted Names across LMPs in the selected dashboard scope. A student appearing in multiple LMPs is counted once.",

  // ── Admin · Attention strip
  "attention.highest-risk-domain": "Domain with the largest combined count of On Hold + Dormant + Closed LMPs.",
  "attention.most-overloaded-poc": "Active POC with the highest active_load value (across all roles).",
  "attention.pending-offers":      "All LMPs currently in Offer Received status (live DB count).",
  "attention.missing-prep-docs":   "Active LMPs missing a prep doc (live DB count, excludes terminal statuses).",
  "attention.overloaded-pocs":     "POCs whose active_load exceeds their max_threshold.",

  // ── POC · personal
  "poc.hero.conversion":           "Your conversion rate across processes where YOU are listed as Prep / Support / Outreach POC.",
  "poc.kpi.active":                "Your processes in Ongoing status — i.e. work in flight.",
  "poc.kpi.offer":                 "Your processes in Offer Received status — awaiting accept / decline.",
  "poc.kpi.risk":                  "Your processes that are On Hold, Dormant, or Closed without conversion.",
  "poc.kpi.total":                 "All processes in your scope after filters.",
  "poc.status-bar":                "Your processes split by Status. Click a segment to drill in.",
  "poc.checklist":                 "Step-by-step task completion across your LMPs. The done / total ratio reflects rows that satisfy each step.",
  "poc.active-table":              "Your in-flight LMPs (Ongoing / Offer Received / On Hold), sorted by most-recently-updated.",
  "poc.lmps.total":                "Total LMPs assigned to you, from the LMP Tracker.",
  "poc.lmps.conversion":           "Your overall conversion rate.",

  // ── Allocator
  "alloc.hero.completeness":       "Required fields filled across all in-scope LMPs, expressed as a percentage.",
  "alloc.kpi.in-scope":            "Processes visible after filters versus the full dataset.",
  "alloc.kpi.issues":              "Total count of missing required fields across all in-scope rows.",
  "alloc.kpi.missing-prep":        "Active LMPs (Ongoing or Offer Received) missing a prep document.",
  "alloc.kpi.status-missing":      "Rows whose Status column is blank — the field is required.",
  "alloc.quality.round-gaps":      "Rows where the latest shortlisted round (R1/R2/R3) doesn't match placementProgress and there's no Offer yet.",
  "alloc.quality.unlogged":        "Closed or Converted rows without a recorded closedReason / convertNames.",
  "alloc.compliance":              "Per-step compliance across all required actions. Click a row to see passing / failing LMPs.",
  "alloc.issue-mix":               "Distribution of in-scope gaps across the four most common categories. Click a segment to drill in.",
  "alloc.tracker.total":           "All LMP records in the tracker for the current scope.",
  "alloc.tracker.ongoing":         "Tracker rows currently in Ongoing status.",
  "alloc.tracker.converted":       "Tracker rows that converted (status or final-convert).",
  "alloc.tracker.domains":         "Distinct domain values present in the current scope.",
} as const;

export type DashboardInfoKey = keyof typeof DASHBOARD_INFO;

export function info(key: DashboardInfoKey): string {
  return DASHBOARD_INFO[key];
}
