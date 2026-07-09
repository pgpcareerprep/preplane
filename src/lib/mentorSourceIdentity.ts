import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mentorSourceFromRow,
  normalizeMentorNameForMatch,
  type MentorSource,
} from "@/lib/mentor";

const SOURCE_ORDER: MentorSource[] = ["MU", "ALU", "EXT"];

export type MentorSourceIdentityRow = {
  id?: string;
  name?: string | null;
  email?: string | null;
  linkedin?: string | null;
  source?: string | null;
  sync_source?: string | null;
};

export type AlumniSourceIdentityRow = {
  student_name?: string | null;
  mu_email_id?: string | null;
  linkedin_profile?: string | null;
};

export function normalizeMentorEmail(email?: string | null): string | null {
  const value = (email || "").trim().toLowerCase();
  return value || null;
}

export function normalizeMentorLinkedIn(url?: string | null): string | null {
  if (!url) return null;
  let value = url.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  const match = value.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (match) return `linkedin.com/in/${match[1]}`;
  return value.includes("linkedin.com") ? value : null;
}

function escapePostgrestValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function orIlikeFilter(column: string, values: string[]): string {
  return values
    .slice(0, 40)
    .map((value) => `${column}.ilike."${escapePostgrestValue(value)}"`)
    .join(",");
}

class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    if (this.parent[index] === index) return index;
    this.parent[index] = this.find(this.parent[index]);
    return this.parent[index];
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
}

function sourcesForMentorRow(row: MentorSourceIdentityRow): MentorSource[] {
  return [mentorSourceFromRow(row)];
}

function sourcesForAlumniRow(): MentorSource[] {
  return ["ALU"];
}

function identityKeysForMentor(row: MentorSourceIdentityRow): string[] {
  const keys: string[] = [];
  const nameKey = normalizeMentorNameForMatch(row.name || "");
  if (nameKey) keys.push(`name:${nameKey}`);
  const email = normalizeMentorEmail(row.email);
  if (email) keys.push(`email:${email}`);
  const linkedin = normalizeMentorLinkedIn(row.linkedin);
  if (linkedin) keys.push(`li:${linkedin}`);
  return keys;
}

function identityKeysForAlumni(row: AlumniSourceIdentityRow): string[] {
  const keys: string[] = [];
  const nameKey = normalizeMentorNameForMatch(row.student_name || "");
  if (nameKey) keys.push(`name:${nameKey}`);
  const email = normalizeMentorEmail(row.mu_email_id);
  if (email) keys.push(`email:${email}`);
  const linkedin = normalizeMentorLinkedIn(row.linkedin_profile);
  if (linkedin) keys.push(`li:${linkedin}`);
  return keys;
}

/** Union MU/ALU/EXT tags across mentors and alumni rows linked by name, email, or LinkedIn. */
export function buildMentorIdentitySourceIndex(
  mentorRows: MentorSourceIdentityRow[],
  alumniRows: AlumniSourceIdentityRow[] = [],
): { byId: Map<string, MentorSource[]>; byName: Map<string, MentorSource[]> } {
  type Node = {
    id?: string;
    nameKey?: string;
    keys: string[];
    sources: MentorSource[];
  };

  const nodes: Node[] = [
    ...mentorRows.map((row) => ({
      id: row.id,
      nameKey: normalizeMentorNameForMatch(row.name || "") || undefined,
      keys: identityKeysForMentor(row),
      sources: sourcesForMentorRow(row),
    })),
    ...alumniRows.map((row) => ({
      nameKey: normalizeMentorNameForMatch(row.student_name || "") || undefined,
      keys: identityKeysForAlumni(row),
      sources: sourcesForAlumniRow(),
    })),
  ];

  const uf = new UnionFind(nodes.length);
  const keyToIndex = new Map<string, number>();
  for (let index = 0; index < nodes.length; index++) {
    for (const key of nodes[index].keys) {
      const existing = keyToIndex.get(key);
      if (existing !== undefined) uf.union(index, existing);
      else keyToIndex.set(key, index);
    }
  }

  const componentSources = new Map<number, Set<MentorSource>>();
  for (let index = 0; index < nodes.length; index++) {
    const root = uf.find(index);
    if (!componentSources.has(root)) componentSources.set(root, new Set());
    for (const source of nodes[index].sources) componentSources.get(root)!.add(source);
  }

  const byId = new Map<string, MentorSource[]>();
  const byName = new Map<string, MentorSource[]>();

  for (let index = 0; index < nodes.length; index++) {
    const root = uf.find(index);
    const sources = SOURCE_ORDER.filter((source) => componentSources.get(root)?.has(source));
    const node = nodes[index];

    if (node.id) byId.set(node.id, sources);
    if (node.nameKey) {
      const existing = byName.get(node.nameKey);
      if (!existing || sources.length > existing.length) byName.set(node.nameKey, sources);
    }
  }

  return { byId, byName };
}

export function resolveMentorSources(
  index: { byId: Map<string, MentorSource[]>; byName: Map<string, MentorSource[]> },
  mentor?: MentorSourceIdentityRow | null,
  fallbackSources: (string | null | undefined)[] = [],
): MentorSource[] {
  if (mentor?.id && index.byId.has(mentor.id)) return index.byId.get(mentor.id)!;
  const nameKey = normalizeMentorNameForMatch(mentor?.name || "");
  if (nameKey && index.byName.has(nameKey)) return index.byName.get(nameKey)!;

  const set = new Set<MentorSource>();
  if (mentor) set.add(mentorSourceFromRow(mentor));
  for (const raw of fallbackSources) {
    const source = (raw || "").toUpperCase();
    if (source === "MU" || source === "ALU" || source === "EXT") set.add(source);
  }
  return SOURCE_ORDER.filter((source) => set.has(source));
}

const MENTOR_ALIAS_SELECT = "id,name,email,linkedin,source,sync_source";
const ALUMNI_ALIAS_SELECT = "student_name,mu_email_id,linkedin_profile";

/** Load mentor + alumni alias rows for assigned mentors (email/name/LinkedIn identity). */
export async function fetchMentorAliasRows(
  supabase: SupabaseClient,
  seeds: MentorSourceIdentityRow[],
): Promise<{ mentors: MentorSourceIdentityRow[]; alumni: AlumniSourceIdentityRow[] }> {
  const mentorsById = new Map<string, MentorSourceIdentityRow>();
  for (const seed of seeds) {
    if (seed.id) mentorsById.set(seed.id, seed);
  }

  const emails = Array.from(new Set(
    seeds.map((row) => normalizeMentorEmail(row.email)).filter(Boolean),
  )) as string[];
  const names = Array.from(new Set(
    seeds.map((row) => (row.name || "").trim()).filter(Boolean),
  ));
  const linkedinHandles = Array.from(new Set(
    seeds.map((row) => normalizeMentorLinkedIn(row.linkedin)).filter(Boolean),
  )) as string[];

  const alumni: AlumniSourceIdentityRow[] = [];
  const alumniKey = new Set<string>();

  const addAlumni = (rows: AlumniSourceIdentityRow[] | null | undefined) => {
    for (const row of rows ?? []) {
      const key = [
        normalizeMentorNameForMatch(row.student_name || ""),
        normalizeMentorEmail(row.mu_email_id) || "",
        normalizeMentorLinkedIn(row.linkedin_profile) || "",
      ].join("::");
      if (!key || alumniKey.has(key)) continue;
      alumniKey.add(key);
      alumni.push(row);
    }
  };

  const tasks: Promise<void>[] = [];

  if (emails.length) {
    tasks.push((async () => {
      const { data } = await supabase
        .from("mentors")
        .select(MENTOR_ALIAS_SELECT)
        .or(orIlikeFilter("email", emails));
      for (const row of data ?? []) {
        if (row.id) mentorsById.set(row.id, row);
      }
    })());

    tasks.push((async () => {
      const { data } = await supabase
        .from("alumni_records")
        .select(ALUMNI_ALIAS_SELECT)
        .or(orIlikeFilter("mu_email_id", emails));
      addAlumni(data);
    })());
  }

  if (names.length) {
    tasks.push((async () => {
      const { data } = await supabase
        .from("mentors")
        .select(MENTOR_ALIAS_SELECT)
        .or(orIlikeFilter("name", names));
      for (const row of data ?? []) {
        if (row.id) mentorsById.set(row.id, row);
      }
    })());

    tasks.push((async () => {
      const { data } = await supabase
        .from("alumni_records")
        .select(ALUMNI_ALIAS_SELECT)
        .or(orIlikeFilter("student_name", names));
      addAlumni(data);
    })());
  }

  if (linkedinHandles.length) {
    const linkedinPatterns = linkedinHandles
      .map((value) => value.split("/").pop() || value)
      .filter(Boolean);
    if (linkedinPatterns.length) {
      tasks.push((async () => {
        const { data } = await supabase
          .from("mentors")
          .select(MENTOR_ALIAS_SELECT)
          .or(orIlikeFilter("linkedin", linkedinPatterns));
        for (const row of data ?? []) {
          if (row.id) mentorsById.set(row.id, row);
        }
      })());

      tasks.push((async () => {
        const { data } = await supabase
          .from("alumni_records")
          .select(ALUMNI_ALIAS_SELECT)
          .or(orIlikeFilter("linkedin_profile", linkedinPatterns));
        addAlumni(data);
      })());
    }
  }

  await Promise.all(tasks);
  return { mentors: Array.from(mentorsById.values()), alumni };
}
