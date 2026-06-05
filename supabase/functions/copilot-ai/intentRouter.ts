// Deterministic pre-LLM intent classifier for the Co-Pilot.
// Lets us short-circuit greetings/help and avoid spinning up the
// "executive-summary in JSON blocks" tool loop for trivial chatter.

export type CopilotIntent =
  | "greeting"
  | "general_chat"
  | "help"
  | "platform_summary"
  | "student_search"
  | "student_progress"
  | "lmp_process_search"
  | "attention_needed"
  | "create_lmp"
  | "update_lmp"
  | "delete_lmp"
  | "summarize_lmp"
  | "compare_progress"
  | "poc_allocation"
  | "mentor_matching"
  | "alumni_matching"
  | "dashboard_query"
  | "analytics_query"
  | "sheet_sync"
  | "report_generation"
  | "voice_command"
  | "entity_listing"
  | "unknown";

const GREETING_PATTERNS = /^(hi|hey+|hello+|howdy|hiya|yo|sup|good\s+(morning|afternoon|evening|night)|how are you|how's it going|what'?s up|wassup|greetings|namaste)\W*$/i;
const HELP_PATTERNS = /\b(help|how do i|what can you do|show me how|guide|tutorial|usage|commands|capabilities)\b/i;
const PLATFORM_SUMMARY_PATTERNS = /\b(overview|summary|dashboard|status|total|all processes|give me a summary|executive|big picture|report card)\b/i;
const STUDENT_PROGRESS_PATTERNS = /\b(progress of|how is .* doing|status of .* student|update on|tracking .* student)\b/i;
const STUDENT_SEARCH_PATTERNS = /\b(student|candidate|find student|search student|look up|who is|profile of)\b/i;
const ATTENTION_PATTERNS = /\b(attention|today|urgent|need my|at.?risk|stale|stuck|delayed|bottleneck|overdue|sla breach)\b/i;
const CREATE_PATTERNS = /\b(create|add|new|start|initiate|open)\b.*\b(lmp|process|record)\b/i;
// Require both an action verb AND an LMP/process/status entity reference to
// avoid false positives like "update me on Samora AI" or "set me up".
const UPDATE_PATTERNS = /\b(update|change|set|mark|move|edit|modify|convert|close|archive)\b[^.?!\n]{0,40}\b(lmp|process|requisition|status|stage|domain|poc|owner|allocator|company|role|record)\b|\b(lmp|process|status|stage|domain|poc|record)\b[^.?!\n]{0,40}\b(update|change|set|mark|move|edit|modify|convert|close|archive)\b/i;
const DELETE_PATTERNS = /\b(delete|remove|archive|soft.?delete)\b/i;
const POC_PATTERNS = /\b(poc|assign|allocate|point of contact|prep poc|outreach poc)\b/i;
const MENTOR_PATTERNS = /\b(mentor|recommend mentor|find mentor|mentor matching)\b/i;
const ALUMNI_PATTERNS = /\b(alumni|alum|alu)\b/i;
const ANALYTICS_PATTERNS = /\b(analytic|metric|kpi|rate|trend|breakdown|distribution|workload|conversion|chart|graph|funnel)\b/i;
const COMPARE_PATTERNS = /\b(compare|vs|versus|difference between|contrast)\b/i;

const ENTITY_LISTING_PATTERNS = /\b(list all|show all|all the|how many|total|count of|who are the)\b.*\b(poc|pocs|student|students|mentor|mentors|alumni)\b|\b(poc|pocs|student|students|mentor|mentors|alumni)\b.*\b(list|all|count|total)\b/i;

export function classifyIntent(userMessage: string): CopilotIntent {
  const msg = (userMessage ?? "").trim();
  if (!msg) return "unknown";
  if (GREETING_PATTERNS.test(msg)) return "greeting";
  if (HELP_PATTERNS.test(msg)) return "help";
  if (ENTITY_LISTING_PATTERNS.test(msg)) return "entity_listing";
  if (STUDENT_PROGRESS_PATTERNS.test(msg)) return "student_progress";
  if (STUDENT_SEARCH_PATTERNS.test(msg)) return "student_search";
  if (ATTENTION_PATTERNS.test(msg)) return "attention_needed";
  if (CREATE_PATTERNS.test(msg)) return "create_lmp";
  if (DELETE_PATTERNS.test(msg)) return "delete_lmp";
  if (UPDATE_PATTERNS.test(msg)) return "update_lmp";
  if (ALUMNI_PATTERNS.test(msg)) return "alumni_matching";
  if (MENTOR_PATTERNS.test(msg)) return "mentor_matching";
  if (POC_PATTERNS.test(msg)) return "poc_allocation";
  if (COMPARE_PATTERNS.test(msg)) return "compare_progress";
  if (ANALYTICS_PATTERNS.test(msg)) return "analytics_query";
  if (PLATFORM_SUMMARY_PATTERNS.test(msg)) return "platform_summary";
  return "unknown";
}

export function getGreetingResponse(firstName = "there"): string {
  const name = firstName?.trim() || "there";
  const responses = [
    `Hey ${name}! 👋 I'm your LMP Co-Pilot. Ask me anything about students, processes, POCs, mentors, or analytics — what would you like to explore today?`,
    `Hi ${name}! Ready to help with LMP operations. Try "show me today's attention list", "progress of <student>", or "POC workload breakdown".`,
    `Hello ${name}! What would you like to work on? I can search students, summarize LMP processes, run POC allocation, or pull analytics.`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

export function getHelpResponse(): string {
  return [
    "Here's what I can help with:",
    "",
    "**Look up data**",
    "• `progress of <student name>` — full student snapshot",
    "• `find LMP processes for <company>` — search the LMP tracker",
    "• `who needs attention today?` — stale or stuck processes",
    "",
    "**Take action**",
    "• `assign POC for <LMP>` — allocator engine + suggestions",
    "• `match mentors for <LMP>` — JD-grounded mentor matching",
    "• `update <LMP> to <status>` — confirm-then-write to the sheet",
    "",
    "**Analytics**",
    "• `pipeline summary` / `conversion rate` / `domain breakdown`",
    "• `POC workload` / `SLA breaches`",
    "",
    "Tip: I can also accept @mentions for students, LMPs, mentors, and POCs.",
  ].join("\n");
}

/** Build a small SSE body that streams a plain assistant text response. */
export function buildPlainSseResponse(text: string): string {
  // Single delta is fine — the client assembles deltas into the assistant message.
  const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
  return `data: ${payload}\n\ndata: [DONE]\n\n`;
}
