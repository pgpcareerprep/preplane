// Shared live-entity search. Replaces the dropped entity_registry table by
// UNION-ing source tables on the fly. Used by entity-search + copilot-ai.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EntityRow = {
  entity_type: string;
  entity_id: string;
  display_name: string;
  email: string | null;
  domain: string | null;
  aliases: string[];
  source_priority: number;
  metadata: Record<string, unknown>;
};

const PRIORITY: Record<string, number> = {
  lmp: 90, poc: 80, student: 70, mentor: 60, alumni: 50, domain: 30,
};

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function fetchPocs(supa: SupabaseClient, query: string, limit: number): Promise<EntityRow[]> {
  let q = supa.from("poc_profiles")
    .select("id,name,email,primary_domain,role_type,active_load,domain_tags,conversion_rate,aliases")
    .limit(limit);
  if (query) q = q.ilike("name", `%${query}%`);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    entity_type: "poc",
    entity_id: String(r.id),
    display_name: r.name,
    email: r.email || null,
    domain: r.primary_domain || null,
    aliases: Array.isArray(r.aliases) ? r.aliases : [],
    source_priority: PRIORITY.poc,
    metadata: { role_type: r.role_type, active_load: r.active_load, domain_tags: r.domain_tags, conversion_rate: r.conversion_rate },
  }));
}

async function fetchStudents(supa: SupabaseClient, query: string, limit: number): Promise<EntityRow[]> {
  let q = supa.from("students")
    .select("id,name,email,phone,primary_domain,actual_domain,roll_no,cohort,composite_primary,interview_risk_flag,placement_status")
    .limit(limit);
  if (query) q = q.ilike("name", `%${query}%`);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    entity_type: "student",
    entity_id: String(r.id),
    display_name: r.name,
    email: r.email || null,
    domain: r.primary_domain || r.actual_domain || null,
    aliases: [],
    source_priority: PRIORITY.student,
    metadata: { roll_no: r.roll_no, cohort: r.cohort, composite: r.composite_primary, risk_flag: r.interview_risk_flag, placement_status: r.placement_status },
  }));
}

async function fetchMentors(supa: SupabaseClient, query: string, limit: number): Promise<EntityRow[]> {
  // Use mentors_union_view so @mention shows the unified source label
  // ("Mentor Union" vs "From Alumni").
  let q = supa.from("mentors_union_view")
    .select("id,name,email,phone,functional_domain,industry,source,company,role,availability,rating,source_label,is_alumni_mirror")
    .limit(limit);
  if (query) q = q.ilike("name", `%${query}%`);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    entity_type: "mentor",
    entity_id: String(r.id),
    display_name: r.name,
    email: r.email || null,
    domain: r.functional_domain || r.industry || null,
    aliases: [],
    source_priority: PRIORITY.mentor,
    metadata: { source: r.source, source_label: r.source_label, is_alumni_mirror: r.is_alumni_mirror, company: r.company, role: r.role, availability: r.availability, rating: r.rating },
  }));
}

async function fetchAlumni(supa: SupabaseClient, query: string, limit: number): Promise<EntityRow[]> {
  let q = supa.from("alumni_records")
    .select("id,student_name,mu_email_id,domain_1,domain_2,cohort,current_company,current_role_title,industry")
    .limit(limit);
  if (query) q = q.ilike("student_name", `%${query}%`);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    entity_type: "alumni",
    entity_id: String(r.id),
    display_name: r.student_name,
    email: r.mu_email_id || null,
    domain: r.domain_1 || r.domain_2 || null,
    aliases: [],
    source_priority: PRIORITY.alumni,
    metadata: { cohort: r.cohort, company: r.current_company, role: r.current_role_title, industry: r.industry },
  }));
}

async function fetchLmps(supa: SupabaseClient, query: string, limit: number): Promise<EntityRow[]> {
  // For LMPs we filter on company/role separately.
  let q = supa.from("lmp_processes")
    .select("id,company,role,domain_raw,status,type,prep_poc,support_poc,outreach_poc")
    .limit(limit);
  if (query) q = q.or(`company.ilike.%${query}%,role.ilike.%${query}%`);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    entity_type: "lmp",
    entity_id: String(r.id),
    display_name: `${r.company} - ${r.role}`,
    email: null,
    domain: r.domain_raw || null,
    aliases: [],
    source_priority: PRIORITY.lmp,
    metadata: { company: r.company, role: r.role, status: r.status, type: r.type, prep_poc: r.prep_poc, support_poc: r.support_poc, outreach_poc: r.outreach_poc },
  }));
}

async function fetchDomains(supa: SupabaseClient, query: string, limit: number): Promise<EntityRow[]> {
  let q = supa.from("domains").select("slug,name,aliases").limit(limit);
  if (query) q = q.ilike("name", `%${query}%`);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    entity_type: "domain",
    entity_id: r.slug,
    display_name: r.name,
    email: null,
    domain: null,
    aliases: Array.isArray(r.aliases) ? r.aliases : [],
    source_priority: PRIORITY.domain,
    metadata: {},
  }));
}

const FETCHERS: Record<string, (s: SupabaseClient, q: string, l: number) => Promise<EntityRow[]>> = {
  poc: fetchPocs,
  student: fetchStudents,
  mentor: fetchMentors,
  alumni: fetchAlumni,
  lmp: fetchLmps,
  domain: fetchDomains,
};

export async function searchEntities(
  supa: SupabaseClient,
  opts: {
  query: string;
  types?: string[];
  limit?: number;
  perTypeLimit?: number;
}): Promise<EntityRow[]> {
  const query = (opts.query ?? "").trim();
  const limit = Math.max(1, Math.min(50, opts.limit ?? 16));
  const perType = Math.max(5, Math.min(12, opts.perTypeLimit ?? 8));
  const types = (opts.types && opts.types.length > 0) ? opts.types : Object.keys(FETCHERS);

  const results = await Promise.all(
    types.filter((t) => FETCHERS[t]).map((t) => FETCHERS[t](supa, query, perType)),
  );
  const all: EntityRow[] = results.flat();

  const lq = query.toLowerCase();
  const scored = all.map((row) => {
    const name = (row.display_name || "").toLowerCase();
    let score = 0;
    if (!query) score = 0.5;
    else if (name === lq) score = 1.0;
    else if (name.startsWith(lq)) score = 0.92;
    else if (name.includes(lq)) score = 0.78;
    else if (row.aliases.some((a) => a.toLowerCase().includes(lq))) score = 0.7;
    else if (row.email && row.email.toLowerCase() === lq) score = 1.0;
    score += row.source_priority / 10000;
    return { row, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => row);

  return scored;
}
