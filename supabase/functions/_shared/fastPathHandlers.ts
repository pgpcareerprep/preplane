import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  isPocConversionMetricsQuery,
  isPocProgressReportQuery,
} from "./copilotFastPaths.ts";
import {
  formatNamedPocConversionSse,
  summarizeConversionStatuses,
  type ConversionMetricsSummary,
} from "./conversionReport.ts";

/** Read-scoping identity for fast paths (view-as or POC self). */
export type FastPathReadScope = {
  effectiveRole: string;
  effectiveName: string | null;
};

export function serviceSupabase(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function operationalPocScopeName(scope: FastPathReadScope): string | null {
  if (scope.effectiveRole === "poc" && scope.effectiveName?.trim()) {
    return scope.effectiveName.trim();
  }
  return null;
}

function nameMatchesPoc(cell: string | null | undefined, pocName: string): boolean {
  if (!cell || !pocName) return false;
  const c = cell.toLowerCase().trim();
  const p = pocName.toLowerCase().trim();
  if (c === p || c.includes(p) || p.includes(c)) return true;
  const cFirst = c.split(/\s+/)[0];
  const pFirst = p.split(/\s+/)[0];
  return !!(cFirst && pFirst && (cFirst === pFirst || cFirst.startsWith(pFirst) || pFirst.startsWith(cFirst)));
}

export function lmpMatchesOperationalPoc(
  l: { prep_poc?: string | null; support_poc?: string | null; outreach_poc?: string | null },
  pocName: string,
): boolean {
  return [l.prep_poc, l.support_poc, l.outreach_poc].some((n) => nameMatchesPoc(n, pocName));
}

/** Prep/support assignment only — matches POC Performance dashboard scope. */
export function lmpMatchesDashboardPoc(
  l: { prep_poc?: string | null; support_poc?: string | null },
  pocName: string,
): boolean {
  return [l.prep_poc, l.support_poc].some((n) => nameMatchesPoc(n, pocName));
}

// ─── Named POC conversion (dashboard-aligned) ────────────────────────────────

export type NamedPocConversionResult =
  | { ok: true; pocName: string; summary: ConversionMetricsSummary }
  | { ok: false; error: string };

export async function fetchNamedPocConversionFastPath(
  pocName: string,
  sb: SupabaseClient = serviceSupabase(),
): Promise<NamedPocConversionResult> {
  const name = pocName.trim();
  if (!name) return { ok: false, error: "POC name is required" };
  const { data, error } = await sb
    .from("lmp_processes")
    .select("status, prep_poc, support_poc")
    .limit(5000);
  if (error) return { ok: false, error: error.message };
  const filtered = (data || []).filter((r) => lmpMatchesDashboardPoc(r, name));
  const summary = summarizeConversionStatuses(filtered.map((r) => r.status));
  return { ok: true, pocName: name, summary };
}

export function formatNamedPocConversionChatSse(
  result: Extract<NamedPocConversionResult, { ok: true }>,
): string {
  return formatNamedPocConversionSse(result.pocName, result.summary);
}

// ─── Mentor coverage ───────────────────────────────────────────────────────

export type MentorCoverageResult =
  | { ok: true; count: number; tableRows: string[][]; rawRows: Record<string, unknown>[]; scopedPoc: string | null }
  | { ok: false; error: string };

export async function fetchMentorCoverageFastPath(
  scope: FastPathReadScope,
  sb: SupabaseClient = serviceSupabase(),
): Promise<MentorCoverageResult> {
  const { data, error } = await sb
    .from("lmp_processes")
    .select("id,company,role,domain_raw,status,prep_poc,support_poc,mentor_aligned,lmp_code")
    .ilike("status", "%ongoing%")
    .or("mentor_aligned.is.null,mentor_aligned.eq.false")
    .order("company")
    .limit(200);
  if (error) return { ok: false, error: error.message };

  let filtered = data || [];
  const scopedPoc = operationalPocScopeName(scope);
  if (scopedPoc) {
    filtered = filtered.filter((r) => lmpMatchesOperationalPoc(r, scopedPoc));
  }

  const tableRows = filtered.map((r) => [
    r.company || "—",
    r.role || "—",
    r.domain_raw || "—",
    r.prep_poc || "Unassigned",
    r.status || "Ongoing",
  ]);

  return {
    ok: true,
    count: tableRows.length,
    tableRows,
    rawRows: filtered,
    scopedPoc,
  };
}

export function formatMentorCoverageChatSse(result: Extract<MentorCoverageResult, { ok: true }>): string {
  const scopeNote = result.scopedPoc ? ` for ${result.scopedPoc}'s assignments` : "";
  const count = result.count;
  return [
    `${count} ongoing LMP process${count === 1 ? "" : "es"}${scopeNote} ${count === 1 ? "does" : "do"} not have a mentor aligned yet.`,
    "",
    ":::blocks",
    JSON.stringify([
      { type: "executive-summary", content: `${count} ongoing processes need mentor alignment${scopeNote}.` },
      { type: "kpi-row", items: [{ label: "Missing mentor", value: count }] },
      {
        type: "table",
        title: result.scopedPoc
          ? `Ongoing processes without mentors (${result.scopedPoc})`
          : "Ongoing processes without mentors",
        headers: ["Company", "Role", "Domain", "Prep POC", "Status"],
        rows: result.tableRows,
      },
    ]),
    ":::",
  ].join("\n");
}

export function formatMentorCoverageVoice(result: Extract<MentorCoverageResult, { ok: true }>): {
  spoken: string;
  blocks: unknown[];
} {
  const scopeNote = result.scopedPoc ? " in your portfolio" : "";
  const count = result.count;
  const spoken = `${count} ongoing LMP process${count === 1 ? "" : "es"}${scopeNote} ${count === 1 ? "needs" : "need"} a mentor aligned.`;
  return {
    spoken,
    blocks: count > 0 ? [{ type: "lmp_list", rows: result.rawRows, total: count }] : [],
  };
}

// ─── Alumni mentor LMPs ──────────────────────────────────────────────────────

export type AlumniMentorLmpResult =
  | { ok: true; count: number; tableRows: string[][] }
  | { ok: false; error: string };

export async function fetchAlumniMentorLmpFastPath(
  sb: SupabaseClient = serviceSupabase(),
): Promise<AlumniMentorLmpResult> {
  const { data, error } = await sb
    .from("lmp_mentors")
    .select("lmp_id, mentors(name,source,sync_source), lmp_processes(company,role,status,domain_raw)")
    .limit(2000);
  if (error) return { ok: false, error: error.message };

  const seen = new Set<string>();
  const tableRows: string[][] = [];
  for (const row of data ?? []) {
    const mentor = row.mentors as { name?: string | null; source?: string | null; sync_source?: string | null } | null;
    const source = (mentor?.source || "").toUpperCase();
    const sync = mentor?.sync_source || "";
    if (source !== "ALU" && sync !== "alumni_mirror") continue;
    const lmpId = String(row.lmp_id || "");
    if (!lmpId || seen.has(lmpId)) continue;
    seen.add(lmpId);
    const proc = row.lmp_processes as { company?: string | null; role?: string | null; status?: string | null; domain_raw?: string | null } | null;
    tableRows.push([
      proc?.company || "—",
      proc?.role || "—",
      proc?.status || "—",
      proc?.domain_raw || "—",
      mentor?.name || "—",
      "ALU",
    ]);
  }

  return { ok: true, count: tableRows.length, tableRows };
}

export function formatAlumniMentorLmpChatSse(result: Extract<AlumniMentorLmpResult, { ok: true }>): string {
  const count = result.count;
  return [
    `Found ${count} LMP process${count === 1 ? "" : "es"} with alumni (ALU) mentors aligned.`,
    "",
    ":::blocks",
    JSON.stringify([
      { type: "executive-summary", content: `${count} LMP process${count === 1 ? "" : "es"} have at least one alumni mentor aligned.` },
      { type: "kpi-row", items: [{ label: "Alumni mentor LMPs", value: count }] },
      {
        type: "table",
        title: "LMPs with alumni mentors",
        headers: ["Company", "Role", "Status", "Domain", "Mentor", "Source"],
        rows: result.tableRows.slice(0, 50),
      },
    ]),
    ":::",
  ].join("\n");
}

// ─── POC workload ────────────────────────────────────────────────────────────

type PocProfileRow = {
  name: string | null;
  role_type: string | null;
  primary_domain: string | null;
  active_load: number | null;
  max_threshold: number | null;
  conversion_rate: number | null;
  status: string | null;
};

type LmpAssignmentRow = {
  status: string | null;
  prep_poc: string | null;
  support_poc: string | null;
  outreach_poc: string | null;
};

export type PocWorkloadRow = {
  capacity: number;
  row: (string | number)[];
  name: string;
};

export type PocWorkloadResult =
  | { ok: true; rows: PocWorkloadRow[]; overCapacity: number; scopedPoc: string | null }
  | { ok: false; error: string }
  | { ok: true; rows: []; overCapacity: 0; scopedPoc: string | null; empty: true };

export async function fetchPocWorkloadFastPath(
  scope: FastPathReadScope,
  sb: SupabaseClient = serviceSupabase(),
): Promise<PocWorkloadResult> {
  const [{ data: profiles, error: profilesError }, { data: lmps, error: lmpsError }] = await Promise.all([
    sb.from("poc_profiles").select("name,role_type,primary_domain,active_load,max_threshold,conversion_rate,status").order("name"),
    sb.from("lmp_processes").select("status,prep_poc,support_poc,outreach_poc").limit(3000),
  ]);
  if (profilesError || lmpsError) {
    return { ok: false, error: profilesError?.message || lmpsError?.message || "Unknown database error" };
  }

  const scopedPoc = operationalPocScopeName(scope);
  let operationalProfiles = (profiles || []).filter((p) =>
    (p.status ?? "active") === "active" && p.role_type !== "outreach_poc",
  );
  if (scopedPoc) {
    operationalProfiles = operationalProfiles.filter((p) => p.name && nameMatchesPoc(p.name, scopedPoc));
  }
  if (!operationalProfiles.length) {
    return { ok: true, rows: [], overCapacity: 0, scopedPoc, empty: true };
  }

  const lmpRows = (lmps || []) as LmpAssignmentRow[];
  const rows = operationalProfiles.map((p: PocProfileRow) => {
    const assigned = lmpRows.filter((l) =>
      [l.prep_poc, l.support_poc, l.outreach_poc].some((name) => name && name.toLowerCase() === p.name?.toLowerCase()),
    );
    const statusCounts: Record<string, number> = {};
    for (const l of assigned) {
      const status = l.status || "Unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    const activeLoad = Number(p.active_load ?? statusCounts.Ongoing ?? 0);
    const threshold = Number(p.max_threshold ?? 10);
    const capacity = threshold > 0 ? Math.round((activeLoad / threshold) * 100) : 0;
    const converted = assigned.filter((l) => /converted|offer/i.test(l.status || "")).length;
    const conversion = Number.isFinite(Number(p.conversion_rate))
      ? Number(p.conversion_rate)
      : (assigned.length ? Math.round((converted / assigned.length) * 1000) / 10 : 0);
    return {
      capacity,
      name: p.name || "—",
      row: [
        p.name || "—",
        activeLoad,
        threshold,
        `${capacity}%${capacity > 80 ? " ⚠" : ""}`,
        `${conversion}%`,
        Object.entries(statusCounts).map(([status, count]) => `${status}: ${count}`).join(", ") || "No assigned processes",
      ],
    };
  }).sort((a, b) => b.capacity - a.capacity);

  const overCapacity = rows.filter((r) => r.capacity > 80).length;
  return { ok: true, rows, overCapacity, scopedPoc };
}

export function pocWorkloadChatIntent(message: string): string {
  if (isPocProgressReportQuery(message)) return "poc_progress_report_fast_path";
  if (isPocConversionMetricsQuery(message)) return "poc_conversion_metrics_fast_path";
  return "poc_workload_fast_path";
}

export function formatPocWorkloadChatSse(
  result: Extract<PocWorkloadResult, { ok: true }>,
  message: string,
): { text: string; intent: string } {
  if ("empty" in result && result.empty) {
    const scoped = result.scopedPoc ? ` for ${result.scopedPoc}` : "";
    return {
      intent: "poc_workload_fast_path_empty",
      text: [
        `No active prep POC profiles were found${scoped} to build a progress report.`,
        "",
        ":::blocks",
        JSON.stringify([{ type: "executive-summary", content: `No active prep POC profiles are configured${scoped}.` }]),
        ":::",
      ].join("\n"),
    };
  }

  const conversionFocus = isPocConversionMetricsQuery(message);
  const reportTitle = isPocProgressReportQuery(message)
    ? "Prep POC progress report"
    : conversionFocus
      ? "POC conversion & performance"
      : result.scopedPoc
        ? `POC workload (${result.scopedPoc})`
        : "POC workload";
  const summaryLine = conversionFocus
    ? `${result.rows.length} POCs reviewed with conversion rate and capacity. ${result.overCapacity} ${result.overCapacity === 1 ? "is" : "are"} above 80% capacity.`
    : `${result.rows.length} POCs reviewed. ${result.overCapacity} ${result.overCapacity === 1 ? "is" : "are"} above 80% capacity.`;

  return {
    intent: pocWorkloadChatIntent(message),
    text: [
      summaryLine,
      "",
      ":::blocks",
      JSON.stringify([
        {
          type: "executive-summary",
          content: conversionFocus
            ? `${result.rows.length} prep POCs with live conversion rate and workload metrics. ${result.overCapacity} above 80% capacity.`
            : `${result.rows.length} prep POCs reviewed using live profiles and LMP assignments. ${result.overCapacity} are above 80% capacity.`,
        },
        { type: "kpi-row", items: [{ label: "POCs", value: result.rows.length }, { label: "Above 80% capacity", value: result.overCapacity }] },
        {
          type: "table",
          title: reportTitle,
          headers: ["POC", "Active load", "Max threshold", "Capacity", "Conversion rate", "Processes by status"],
          rows: result.rows.map((r) => r.row),
        },
      ]),
      ":::",
    ].join("\n"),
  };
}

export function formatPocWorkloadVoice(result: Extract<PocWorkloadResult, { ok: true }>): {
  spoken: string;
  blocks: unknown[];
} {
  if ("empty" in result && result.empty) {
    return {
      spoken: result.scopedPoc
        ? `I couldn't find active workload data for ${result.scopedPoc}.`
        : "No active prep POC profiles were found.",
      blocks: [],
    };
  }

  const overloaded = result.rows.filter((r) => r.capacity > 80);
  const spoken = overloaded.length
    ? `${overloaded.length} POC${overloaded.length === 1 ? "" : "s"} ${result.scopedPoc ? "in your workload " : ""}are above eighty percent capacity. ${overloaded.slice(0, 3).map((p) => p.name).join(", ")} need attention first.`
    : result.scopedPoc
      ? "Your workload is below eighty percent capacity right now."
      : "No POCs are above eighty percent capacity right now.";

  return {
    spoken,
    blocks: [{
      type: "analytics",
      metric: "poc_workload",
      data: {
        scoped_poc: result.scopedPoc,
        over_capacity: result.overCapacity,
        rows: result.rows,
      },
    }],
  };
}
