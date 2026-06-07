/**
 * Quick-prompt presets shown in the Copilot panel.
 * Kept separate from `copilotEngine.ts` so UI surfaces can import the
 * preset list without pulling in the batching/RPC layer.
 */
export const QUICK_PROMPTS: { title: string; sub: string; prompt: string }[] = [
  { title: "Today's attention",  sub: "Processes needing action right now",        prompt: "Which LMP processes need attention today? List prep-ongoing ones sorted by last activity date (oldest first), with POC name, company, role, and how long since last update." },
  { title: "POC workload",       sub: "Load distribution & conversion rates",      prompt: "Show me every POC's current active load, max threshold, conversion rate, and how many processes are in each status. Flag anyone at >80% capacity." },
  { title: "Mentor coverage",    sub: "Which LMPs still need a mentor",            prompt: "Which ongoing LMP processes don't have a mentor aligned yet? Show company, role, domain, and assigned POC so I can prioritise outreach." },
  { title: "At-risk students",   sub: "Low scores or interview risk flags",        prompt: "List students with an interview_risk flag set to true, or with composite_primary below 60, or mock_score below 50. Include name, roll number, and their linked LMP if any." },
  { title: "Conversion summary", sub: "Converted vs total by POC & domain",       prompt: "Give me a conversion breakdown: total processes, converted count, and conversion rate for each POC and each domain. Sort by conversion rate descending." },
  { title: "Stale processes",    sub: "No progress in 14+ days",                  prompt: "Which prep-ongoing LMP processes haven't had any progress update in more than 14 days? Show company, role, POC, and days since last update." },
  { title: "Session tracker",    sub: "Upcoming & completed sessions",             prompt: "List all scheduled sessions in the next 7 days and all sessions completed in the last 7 days — mentor name, candidate, LMP company/role, date, and status." },
  { title: "Mentor ratings",     sub: "Top and lowest-rated mentors",             prompt: "Show the top 10 and bottom 5 mentors by average rating (mentor_rating), including completed session count and their most recent LMP company/role." },
];
