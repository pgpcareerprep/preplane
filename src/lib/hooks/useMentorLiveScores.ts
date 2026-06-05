/**
 * useMentorLiveScores
 * -------------------
 * Computes the per-dimension match breakdown (role / skills / company /
 * industry / seniority) for ONE mentor against ONE specific LMP process.
 *
 * Why: the global `mentors.score_*` columns are stub zeros — match scores are
 * only meaningful in the context of a specific JD. This hook resolves the
 * mentor against its source-of-truth (MU `mentors` row, ALU `alumni_records`,
 * or EXT cached profile) and reuses the canonical `runPipeline()` scorer.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MentorSource } from "@/lib/mentor";
import {
  runPipeline,
  normaliseDbMentor,
  normaliseALU,
  inferSeniorityFromRole,
  type ScoringCandidate,
  type JdInfo,
} from "@/lib/mentorPipeline";
import type { ALUMentor } from "@/lib/alumniStore";
import { getScoringWeights } from "@/lib/scoringWeights";

export type LiveScoreBreakdown = {
  role: number;
  skills: number;
  company: number;
  industry: number;
  seniority: number;
  total: number;
  /** Which source-of-truth was used to build the scored candidate. */
  resolvedFrom: "MU" | "ALU" | "EXT_fallback";
  /** Best-effort flag when the EXT path had no fresh snapshot. */
  ext_stale?: boolean;
};

type Args = {
  mentorDbRow: any | undefined;
  source: MentorSource | undefined;
  lmpId: string | undefined;
};

function alumniRowToALUMentor(row: any): ALUMentor {
  const allCompanies = Array.from(
    new Set(
      [
        row.current_company,
        row.company_2,
        row.company_3,
        row.company_4,
        row.company_5,
        row.company_6,
      ].filter(Boolean) as string[],
    ),
  );
  const allRoles = Array.from(
    new Set(
      [
        row.current_role_title,
        row.role_2,
        row.role_4,
        row.role_5,
        row.role_6,
      ].filter(Boolean) as string[],
    ),
  );
  return {
    id: row.id,
    name: row.student_name,
    cohort: row.cohort,
    muEmail: row.mu_email_id,
    linkedin: row.linkedin_profile,
    industry: row.industry,
    domain1: row.domain_1,
    domain2: row.domain_2,
    currentCompany: row.current_company,
    currentRole: row.current_role_title,
    company2: row.company_2,
    role2: row.role_2,
    company3: row.company_3,
    company4: row.company_4,
    role4: row.role_4,
    company5: row.company_5,
    role5: row.role_5,
    company6: row.company_6,
    role6: row.role_6,
    allCompanies,
    allRoles,
    // alumni_records does not yet carry skill_tags; pipeline will gate skills=0
    skills: [],
    uploadedAt: row.uploaded_at,
  };
}

function buildExtCandidate(m: any): ScoringCandidate {
  return {
    id: m.id || `ext_${Math.random().toString(36).slice(2)}`,
    name: m.name || "",
    role: m.designation || m.role || "",
    company: m.company || "",
    allCompanies: [m.company].filter(Boolean),
    skills: Array.isArray(m.skill_tags) ? m.skill_tags : [],
    seniority_level: m.seniority || inferSeniorityFromRole(m.designation || m.role || ""),
    industry: m.industry || m.functional_domain || undefined,
    linkedin: m.linkedin || undefined,
    email: m.email || undefined,
    phone: m.phone || undefined,
    remunerationInr: Number(m.remuneration_inr ?? m.rate ?? 0) || undefined,
    source: "EXT",
    rating: m.rating != null ? Number(m.rating) : null,
    sessions_taken: m.reviews ?? null,
  };
}

async function resolveCandidate(
  mentorDbRow: any,
  source: MentorSource,
): Promise<{ candidate: ScoringCandidate; resolvedFrom: LiveScoreBreakdown["resolvedFrom"]; ext_stale?: boolean }> {
  if (source === "MU") {
    return { candidate: normaliseDbMentor({ ...mentorDbRow, source: "MU" }), resolvedFrom: "MU" };
  }

  if (source === "ALU") {
    // Try email-exact match first, then fuzzy name.
    let alumniRow: any = null;
    const email = (mentorDbRow.email || "").trim().toLowerCase();
    if (email) {
      const { data } = await supabase
        .from("alumni_records")
        .select("*")
        .ilike("mu_email_id", email)
        .limit(1)
        .maybeSingle();
      alumniRow = data;
    }
    if (!alumniRow && mentorDbRow.name) {
      const { data } = await supabase
        .from("alumni_records")
        .select("*")
        .ilike("student_name", String(mentorDbRow.name).trim())
        .limit(1)
        .maybeSingle();
      alumniRow = data;
    }
    if (alumniRow) {
      return { candidate: normaliseALU(alumniRowToALUMentor(alumniRow)), resolvedFrom: "ALU" };
    }
    // Fall through to mentors-row scoring tagged as ALU.
    return { candidate: normaliseDbMentor({ ...mentorDbRow, source: "ALU" }), resolvedFrom: "ALU" };
  }

  // EXT: no per-LMP snapshot store yet; score from the mentors-row snapshot.
  return { candidate: buildExtCandidate(mentorDbRow), resolvedFrom: "EXT_fallback", ext_stale: true };
}

async function fetchJdInfo(lmpId: string): Promise<JdInfo> {
  const { data, error } = await supabase
    .from("lmp_processes")
    .select("role, company, jd_skills, jd_seniority, domain_raw")
    .eq("id", lmpId)
    .maybeSingle();
  if (error) throw error;
  const jdSkillsRaw = (data as any)?.jd_skills;
  const jdSkills: string[] = Array.isArray(jdSkillsRaw)
    ? jdSkillsRaw.filter((s): s is string => typeof s === "string")
    : [];
  return {
    jdRole: (data as any)?.role ?? "",
    jdCompany: (data as any)?.company ?? "",
    jdIndustry: (data as any)?.domain_raw ?? "",
    jdSeniority: (data as any)?.jd_seniority ?? "",
    jdSkills,
    gapSkills: [],
  };
}

export function useMentorLiveScores({ mentorDbRow, source, lmpId }: Args) {
  return useQuery<LiveScoreBreakdown | null>({
    enabled: !!mentorDbRow?.id && !!source && !!lmpId,
    queryKey: ["mentor-live-scores", mentorDbRow?.id, source, lmpId] as const,
    staleTime: 60_000,
    queryFn: async () => {
      if (!mentorDbRow?.id || !source || !lmpId) return null;
      const [{ candidate, resolvedFrom, ext_stale }, jd] = await Promise.all([
        resolveCandidate(mentorDbRow, source),
        fetchJdInfo(lmpId),
      ]);
      const weights = getScoringWeights();
      const scored = runPipeline([candidate], jd, weights, "balanced");
      const top = scored[0];
      if (!top) {
        return {
          role: 0, skills: 0, company: 0, industry: 0, seniority: 0, total: 0,
          resolvedFrom,
          ext_stale,
        };
      }
      return {
        role: top.scores.role ?? 0,
        skills: top.scores.skills ?? 0,
        company: top.scores.company ?? 0,
        industry: top.scores.industry ?? 0,
        seniority: top.scores.seniority ?? 0,
        total: top.score ?? 0,
        resolvedFrom,
        ext_stale,
      };
    },
  });
}
