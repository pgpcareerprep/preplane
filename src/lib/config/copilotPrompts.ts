/**
 * Quick-prompt presets shown in the Copilot panel.
 * Kept separate from `copilotEngine.ts` so UI surfaces can import the
 * preset list without pulling in the batching/RPC layer.
 */
export const QUICK_PROMPTS: { title: string; sub: string; prompt: string }[] = [
  { title: "My today's tasks",   sub: "Active processes needing attention",        prompt: "What LMP processes need my attention today? Show ongoing ones with the oldest activity." },
  { title: "POC workload",       sub: "Load distribution across POCs",             prompt: "Show me the workload breakdown for all POCs — how many processes each one is handling and their conversion rates." },
  { title: "Process health",     sub: "Pipeline status & conversion",              prompt: "Give me a pipeline summary — total processes, status distribution, conversion rate, and domain breakdown." },
  { title: "Student risk list",  sub: "At-risk or stuck students",                 prompt: "Which students have an interview risk flag, low composite_primary, or low mock_score? Query the students table." },
  { title: "Mentor finder",      sub: "Find mentors by domain",                    prompt: "Find available mentors in the Finance functional_domain from the mentors table — return name, company, role, seniority, and overall_score." },
  { title: "SLA breaches",       sub: "Old processes past threshold",              prompt: "Show age tracking — which processes have been running the longest? Sort by age." },
  { title: "Recent updates",     sub: "Latest changes across processes",           prompt: "Search for all LMP processes updated in the last 7 days." },
  { title: "Bulk update",        sub: "Change multiple records at once",           prompt: "Show me all Dormant processes so I can decide which ones to mark as Closed." },
];
