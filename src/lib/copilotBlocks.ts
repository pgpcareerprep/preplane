/**
 * Dynamic UI Block types for the LMP Copilot.
 * The AI returns an array of these blocks, and the frontend renders them.
 */

export type KpiItem = {
  label: string;
  value: string | number;
  delta?: string;
  trend?: "up" | "down" | "flat";
  color?: string;
};

export type ChartDataPoint = {
  label: string;
  value: number;
  color?: string;
};

export type TimelineEvent = {
  date: string;
  text: string;
  status?: "success" | "warning" | "error" | "info" | "neutral";
  author?: string;
};

export type KanbanColumn = {
  title: string;
  count: number;
  items: { id: string; label: string; sub?: string; tag?: string }[];
};

export type AlertCard = {
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
};

export type RecommendationItem = {
  action: string;
  reason: string;
  priority?: "high" | "medium" | "low";
};

export type TableRow = Record<string, string | number>;

export type ProgressItem = {
  label: string;
  value: number;
  status?: "done" | "in-progress" | "pending";
};

export type HeatmapCell = {
  row: string;
  col: string;
  value: number;
};

export type FunnelStep = {
  label: string;
  value: number;
  color?: string;
};

// ─── Form Field Types ───

export type FormFieldBase = {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
};

export type TextFormField = FormFieldBase & { field_type: "text" };
export type TextareaFormField = FormFieldBase & { field_type: "textarea" };
export type SelectFormField = FormFieldBase & { field_type: "select"; options: string[] };
export type MultiSelectFormField = FormFieldBase & { field_type: "multi-select"; options: string[] };
export type DateFormField = FormFieldBase & { field_type: "date" };
export type CheckboxFormField = FormFieldBase & { field_type: "checkbox"; defaultValue?: string };
export type SearchSelectFormField = FormFieldBase & { field_type: "search-select"; options: string[] };

export type FormField =
  | TextFormField
  | TextareaFormField
  | SelectFormField
  | MultiSelectFormField
  | DateFormField
  | CheckboxFormField
  | SearchSelectFormField;

// ─── Action Button Types ───

export type ActionButton = {
  label: string;
  action: string;        // command sent back to copilot
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: string;         // icon hint: "plus", "check", "edit", "trash", etc.
  confirm?: string;      // if set, show confirmation dialog with this message
};

// ─── Interactive Table Types ───

export type TableRowAction = {
  label: string;
  action: string;        // template with {{column}} placeholders
  variant?: "primary" | "secondary" | "danger";
};

// ─── Block Types ───

export type ExecutiveSummaryBlock = {
  type: "executive-summary";
  content: string;
  highlights?: string[];
};

export type KpiRowBlock = {
  type: "kpi-row";
  title?: string;
  items: KpiItem[];
};

export type BarChartBlock = {
  type: "bar-chart";
  title: string;
  data: ChartDataPoint[];
  orientation?: "horizontal" | "vertical";
};

export type DonutChartBlock = {
  type: "donut-chart";
  title: string;
  data: ChartDataPoint[];
  centerLabel?: string;
};

export type AreaChartBlock = {
  type: "area-chart";
  title: string;
  data: ChartDataPoint[];
};

export type FunnelBlock = {
  type: "funnel";
  title: string;
  steps: FunnelStep[];
};

export type TableBlock = {
  type: "table";
  title?: string;
  headers: string[];
  rows: (string | number)[][];
  row_actions?: TableRowAction[];
  selectable?: boolean;
  selection_action?: string; // command template for bulk action on selected rows
};

export type StatusCardsBlock = {
  type: "status-cards";
  title?: string;
  cards: { label: string; value: number; color?: string }[];
};

export type TimelineBlock = {
  type: "timeline";
  title?: string;
  events: TimelineEvent[];
};

export type KanbanBlock = {
  type: "kanban";
  title?: string;
  columns: KanbanColumn[];
};

export type HeatmapBlock = {
  type: "heatmap";
  title: string;
  rows: string[];
  cols: string[];
  cells: HeatmapCell[];
};

export type AlertCardsBlock = {
  type: "alert-cards";
  title?: string;
  alerts: AlertCard[];
};

export type RecommendationsBlock = {
  type: "recommendations";
  title?: string;
  items: RecommendationItem[];
};

export type FollowUpsBlock = {
  type: "follow-ups";
  suggestions: string[];
};

export type ProgressTrackerBlock = {
  type: "progress-tracker";
  title?: string;
  items: ProgressItem[];
};

export type TextBlock = {
  type: "text";
  content: string;
};

// ─── NEW Interactive Block Types ───

export type InlineFormBlock = {
  type: "inline-form";
  title: string;
  description?: string;
  fields: FormField[];
  submit_label?: string;
  submit_action: string;  // command template with {{field_name}} placeholders
  cancel_label?: string;
  /** UUID of the LMP being edited — used for client-side POC ownership pre-check. Omit for pure-create forms. */
  target_lmp_id?: string;
  /** Action identifier — used for permission lookup. e.g. edit_daily_progress, update_status, assign_poc, create_lmp */
  action?: string;
};

export type ActionButtonsBlock = {
  type: "action-buttons";
  title?: string;
  buttons: ActionButton[];
  layout?: "row" | "grid";
};

export type ConfirmationCardBlock = {
  type: "confirmation-card";
  title: string;
  description: string;
  changes?: { field: string; from?: string; to: string }[];
  confirm_action: string;
  confirm_label?: string;
  cancel_label?: string;
  // Phase F additions
  pending_action_id?: string;     // server-issued id from prepare_write
  sync_impact?: string;           // e.g. "Updates Google Sheet + activity log"
  role?: string;                  // role checked
  permission?: string;            // permission action checked
  expires_at?: string;            // ISO timestamp
};

export type InfoCardBlock = {
  type: "info-card";
  title: string;
  fields: { label: string; value: string }[];
  actions?: ActionButton[];
  status?: { label: string; color: string };
};

export type PipelineCardBlock = {
  type: "pipeline-card";
  title: string;
  stages: { name: string; count: number; active?: boolean }[];
  current_stage?: string;
  entity?: string;
  move_action?: string;
};

export type ActivityFeedEntry = {
  action: string;
  status: "success" | "error" | "pending" | "info";
  timestamp?: string;
  details?: string;
  follow_ups?: string[];
};

export type ActivityFeedBlock = {
  type: "activity-feed";
  title?: string;
  entries: ActivityFeedEntry[];
};

export type DisambiguationCandidate = {
  entity_type: string;
  entity_id: string;
  display_name: string;
  sub?: string;
  confidence?: number;
};

export type DisambiguationCardBlock = {
  type: "disambiguation-card";
  query: string;
  prompt?: string;
  candidates: DisambiguationCandidate[];
  /**
   * Action template to dispatch when the user picks a candidate.
   * Use placeholders {entity_id}, {entity_type}, {display_name}.
   * Example: "Show me the LMP for {display_name} (id={entity_id})"
   * If omitted, a default "Use {display_name}" prompt is sent.
   */
  pending_action?: string;
  cancel_label?: string;
};

export type PermissionDeniedCardBlock = {
  type: "permission-denied-card";
  action: string;
  human_action?: string;
  role: string;
  reason: string;
  safe_alternative?: string;
  /** Optional follow-up action label (sent as a user message when clicked). */
  alternative_action?: string;
};

export type JdSummaryCardBlock = {
  type: "jd-summary-card";
  company: string;
  role: string;
  domain?: string;
  seniority?: string;
  summary?: string;
  required_skills?: string[];
  preferred_skills?: string[];
  responsibilities?: string[];
  qualifications?: string[];
  years_experience?: string;
  location?: string;
  employment_type?: string;
  source?: "text" | "url" | "reused";
  reused_from?: string;
  confidence?: number;
  /** Action label sent on Confirm (e.g. "Find mentors for this JD"). */
  next_action_label?: string;
  next_action_command?: string;
};

export type MentorShortlistItem = {
  mentor_id: string;
  name: string;
  initials?: string;
  designation?: string;
  company?: string;
  source: "MU" | "ALU" | "EXT";
  seniority?: string;
  industry?: string;
  skill_tags?: string[];
  score: number;
  score_breakdown?: { role?: number; skills?: number; company?: number; industry?: number; seniority?: number };
  rating?: number;
  reviews?: number;
  availability?: "available" | "busy";
  rate?: number;
  currency?: string;
  match_reasons?: string[];
};

export type MentorShortlistCardBlock = {
  type: "mentor-shortlist-card";
  for_company: string;
  for_role: string;
  jd_summary?: string;
  shortlist: MentorShortlistItem[];
  /** Quick action template for assigning a single mentor; placeholders {mentor_id}, {name}. */
  assign_action_template?: string;
  notes?: string;
};

export type CvGapCardBlock = {
  type: "cv-gap-card";
  candidate_name: string;
  lmp_company?: string;
  lmp_role?: string;
  ats_score?: number;
  grade?: string;
  missing_mandatory?: string[];
  missing_preferred?: string[];
  top_recommendations?: string[];
};

export type CaseStudyRubricItem = {
  criterion: string;
  weight: number;
  description: string;
};

export type CaseStudyCardBlock = {
  type: "case-study-card";
  company: string;
  role: string;
  domain?: string;
  situation: string;
  prompt: string;
  rubric: CaseStudyRubricItem[];
  model_answer_outline: string[];
};

export type PlanStep = {
  id: string;
  /** Short imperative title shown to the user (e.g. "Resolve mentor"). */
  title: string;
  /** Optional 1-line detail / what the step will do. */
  detail?: string;
  /** Underlying tool the step maps to (informational only). */
  tool?: string;
  /** Lifecycle status. */
  status: "pending" | "in_progress" | "done" | "failed" | "skipped";
  /** Optional ids of steps that must complete first. */
  depends_on?: string[];
  /** Optional short result or error blurb shown under the step. */
  result_summary?: string;
};

export type PlanCardBlock = {
  type: "plan-card";
  plan_id: string;
  goal: string;
  steps: PlanStep[];
  /** ISO timestamp when planning started; used to render age. */
  started_at?: string;
  /** Optional banner status (e.g. "Awaiting confirmation", "Completed"). */
  banner?: string;
  /** Optional one-shot action template to resume execution if paused. */
  resume_action?: string;
  /** Whether the plan is now finalised. */
  done?: boolean;
};

export type CopilotBlock =
  | ExecutiveSummaryBlock
  | KpiRowBlock
  | BarChartBlock
  | DonutChartBlock
  | AreaChartBlock
  | FunnelBlock
  | TableBlock
  | StatusCardsBlock
  | TimelineBlock
  | KanbanBlock
  | HeatmapBlock
  | AlertCardsBlock
  | RecommendationsBlock
  | FollowUpsBlock
  | ProgressTrackerBlock
  | TextBlock
  | InlineFormBlock
  | ActionButtonsBlock
  | ConfirmationCardBlock
  | InfoCardBlock
  | PipelineCardBlock
  | ActivityFeedBlock
  | DisambiguationCardBlock
  | PermissionDeniedCardBlock
  | JdSummaryCardBlock
  | MentorShortlistCardBlock
  | CvGapCardBlock
  | CaseStudyCardBlock
  | PlanCardBlock;
/** Allowlist of block.type values the renderer knows about. */
const VALID_BLOCK_TYPES = new Set<string>([
  "executive-summary", "kpi-row", "bar-chart", "donut-chart", "area-chart",
  "funnel", "table", "status-cards", "timeline", "kanban", "heatmap",
  "alert-cards", "recommendations", "follow-ups", "progress-tracker", "text",
  "inline-form", "action-buttons", "confirmation-card", "info-card",
  "pipeline-card", "activity-feed", "disambiguation-card", "permission-denied-card",
  "jd-summary-card", "mentor-shortlist-card", "cv-gap-card", "case-study-card", "plan-card",
]);

function isValidBlock(b: unknown): b is CopilotBlock {
  if (!b || typeof b !== "object") return false;
  const t = (b as { type?: unknown }).type;
  if (typeof t !== "string") return false;
  return VALID_BLOCK_TYPES.has(t);
}

/**
 * Parse assistant content for :::blocks JSON fence.
 * Filters out malformed / unknown blocks so partial streams never crash the renderer.
 */
/**
 * Extract every top-level balanced {...} object from a partial JSON array body.
 * Used while the model is still streaming so we can render blocks as soon as
 * each one is complete, instead of waiting for the closing `]` / `:::` fence.
 */
function extractPartialObjects(body: string): unknown[] {
  const out: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{") { if (depth === 0) objStart = i; depth++; continue; }
    if (c === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const slice = body.slice(objStart, i + 1);
        try { out.push(JSON.parse(slice)); } catch { /* skip malformed */ }
        objStart = -1;
      }
    }
  }
  return out;
}

/** True when content opens a :::blocks fence but never closes with \\n:::. */
export function isIncompleteBlocksFence(content: string): boolean {
  if (!content.includes(":::blocks")) return false;
  return !/\n:::\s*$/.test(content.trim()) && !content.includes("\n:::");
}

/** Salvage renderable blocks from a truncated stream (e.g. timeout mid-executive-summary). */
function salvagePartialBlocks(content: string): CopilotBlock[] {
  const match = content.match(
    /"type"\s*:\s*"executive-summary"[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/,
  );
  if (!match?.[1]) return [];
  const summary = match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
  if (!summary) return [];
  return [{ type: "executive-summary", content: summary }];
}

export function parseBlocks(
  content: string,
): { blocks: CopilotBlock[]; plainText: string; fenceDetected: boolean } {
  // Tolerant opener: `:::blocks` followed by any whitespace, then `[`.
  const openerRegex = /:::blocks\s*\[/;
  const openerMatch = openerRegex.exec(content);

  if (!openerMatch) {
    const danglingFence = content.indexOf(":::blocks");
    if (danglingFence >= 0) {
      return { blocks: [], plainText: content.slice(0, danglingFence).trim(), fenceDetected: true };
    }
    return { blocks: [], plainText: content, fenceDetected: false };
  }

  const fenceStart = openerMatch.index;
  const bracketIdx = openerMatch.index + openerMatch[0].length - 1; // position of `[`
  const before = content.slice(0, fenceStart);

  // Find an optional closing `:::` after the bracket.
  const afterBracket = content.slice(bracketIdx);
  const closeIdx = afterBracket.indexOf("\n:::");
  const fenceBody = closeIdx >= 0 ? afterBracket.slice(0, closeIdx) : afterBracket;
  const after = closeIdx >= 0 ? afterBracket.slice(closeIdx + 4) : "";

  let parsed: unknown = null;
  try { parsed = JSON.parse(fenceBody); } catch { /* still streaming */ }

  let blocks: CopilotBlock[] = [];
  if (Array.isArray(parsed)) {
    blocks = parsed.filter(isValidBlock);
  } else {
    // Partial: extract whatever balanced objects we have so far.
    const partials = extractPartialObjects(fenceBody.slice(1)); // drop leading `[`
    blocks = partials.filter(isValidBlock);
  }

  if (blocks.length === 0 && closeIdx < 0) {
    blocks = salvagePartialBlocks(content).filter(isValidBlock);
  }

  const plainText = (before + after).trim();
  return { blocks, plainText, fenceDetected: true };
}
