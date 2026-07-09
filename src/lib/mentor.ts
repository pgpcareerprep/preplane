export type MentorSource = "MU" | "ALU" | "EXT";

export type Mentor = {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  company: string;
  source: MentorSource;
  sourceRank?: 1 | 2 | 3;
  score: number;
  scores: { role: number; skills: number; company: number; industry: number; seniority: number };
  layer: string;
  decisionTags: { emoji: string; label: string }[];
  rating: number | null;
  reviews: number | null;
  outcome: number; // % goal met
  availability: "available" | "busy";
  email: string;
  phone: string;
  seniority: "Mid" | "Senior" | "Lead" | "Staff";
  shortlisted?: boolean;
  linkedin?: string;
  /** Mentor Union member toggle — defaults to source==="MU". */
  mentorUnion?: boolean;
  /** Per-session remuneration in INR. */
  remunerationInr?: number;
  pastExperience?: { role: string; company: string; years: string }[];
  mentorshipHistory?: { reqRole: string; reqCompany: string; outcome: "converted" | "not-converted" | "ongoing"; rating?: number }[];
  internal?: { lmpOwner: string; poc: string; feedbackAvg: number; feedbackCount: number };
  /** New spec: tier code + label, breakdown out of 45, signals for justification. */
  tier?: "L1" | "L2" | "L3" | "L4" | "L5";
  tier_label?: string;
  rank?: number;
  score_breakdown?: {
    skill: number;
    seniority: number;
    prestige: number;
    
    source: number;
    total: number;
  };
  match_signals?: {
    matched_skills: string[];
    missing_skills: string[];
    seniority_note: string;
    company_note: string;
    source_note: string;
    gap_coverage: string[];
  };
  /** External discovery metadata (only populated when source === "EXT"). */
  platform?: "Topmate" | "ADPList" | "LinkedIn" | "Superpeer";
  external_links?: { platform: string; booking: string | null; linkedin: string | null };
  sessions_taken?: number | null;
  /** Marked when dedup detects a name+role collision without company match. */
  possibleDuplicate?: boolean;
  location?: string | null;
  country?: string | null;
  region_verified?: boolean;
  region_evidence?: string | null;
  source_evidence?: string | null;
  source_url?: string | null;
  topmate_url?: string | null;
  adplist_url?: string | null;
  confidence?: number;
  snippet_verified?: boolean;
};

export const SOURCE_META: Record<MentorSource, { label: string; chip: string; dot: string }> = {
  MU:  { label: "Mentor Union", chip: "bg-teal-50 text-teal-600 border-teal-200",   dot: "bg-teal-400" },
  ALU: { label: "Alumni",       chip: "bg-sage-50 text-sage-600 border-sage-200",   dot: "bg-sage-400" },
  EXT: { label: "External",     chip: "bg-sky-400/10 text-sky-400 border-sky-400/30", dot: "bg-sky-400" },
};

const SOURCE_ORDER: MentorSource[] = ["MU", "ALU", "EXT"];

export function normalizeMentorNameForMatch(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function mentorSourceFromRow(row: {
  source?: string | null;
  sync_source?: string | null;
}): MentorSource {
  const src = (row.source || "").toUpperCase();
  if (src === "MU" || src === "ALU" || src === "EXT") return src;
  if (row.sync_source === "alumni_mirror") return "ALU";
  return "EXT";
}

export function mergeMentorSources(
  ...sources: (string | null | undefined)[]
): MentorSource[] {
  const set = new Set<MentorSource>();
  for (const raw of sources) {
    const s = (raw || "").toUpperCase();
    if (s === "MU" || s === "ALU" || s === "EXT") set.add(s);
  }
  return SOURCE_ORDER.filter((s) => set.has(s));
}

/** Collect unique MU/ALU/EXT tags for mentors sharing the same name. */
export function buildNameToSourcesMap(
  rows: { name?: string | null; source?: string | null; sync_source?: string | null }[],
): Map<string, MentorSource[]> {
  const acc = new Map<string, Set<MentorSource>>();
  for (const row of rows) {
    const key = normalizeMentorNameForMatch(row.name || "");
    if (!key) continue;
    const src = mentorSourceFromRow(row);
    if (!acc.has(key)) acc.set(key, new Set());
    acc.get(key)!.add(src);
  }
  const out = new Map<string, MentorSource[]>();
  for (const [key, set] of acc) {
    out.set(key, SOURCE_ORDER.filter((s) => set.has(s)));
  }
  return out;
}

export const SCORE_DIM_COLORS = {
  role:      "bg-orange-500",
  skills:    "bg-teal-400",
  company:   "bg-plum-400",
  industry:  "bg-sky-400",
  seniority: "bg-sage-400",
} as const;

export const SCORE_DIM_MAX = { role: 35, skills: 25, company: 20, industry: 15, seniority: 10 } as const;