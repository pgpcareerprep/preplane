import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requestState } from "../requestContext.ts";
import { getCacheClient } from "../cache.ts";

function matchesFilter(val: string, filter: string): boolean {
  return val.toLowerCase().includes(filter.toLowerCase());
}

async function resolveCvText(args: Record<string, unknown>): Promise<{ cvText: string; candidateName: string } | { error: string }> {
  const direct = String(args.cv_text || "").trim();
  if (direct.length >= 100) {
    return {
      cvText: direct,
      candidateName: String(args.candidate_name || args.name || "Candidate").trim() || "Candidate",
    };
  }

  const cvUrl = String(args.cv_url || "").trim();
  if (cvUrl) {
    try {
      const resp = await fetch(cvUrl, { signal: AbortSignal.timeout(20_000) });
      if (!resp.ok) return { error: `Could not fetch cv_url (${resp.status}). Paste CV text instead.` };
      const text = (await resp.text()).trim();
      if (text.length >= 100) {
        return {
          cvText: text,
          candidateName: String(args.candidate_name || args.name || "Candidate").trim() || "Candidate",
        };
      }
      return { error: "cv_url did not return enough text. Paste the CV content or share a plain-text resume link." };
    } catch (e) {
      return { error: `cv_url fetch failed: ${(e as Error).message}. Paste CV text instead.` };
    }
  }

  return {
    error: "cv_text is required (minimum 100 characters). Ask the user to paste the candidate's CV/resume text or provide a direct plain-text cv_url.",
  };
}

async function resolveJdContext(args: Record<string, unknown>): Promise<{ jdText: string; company: string; role: string }> {
  const jdTextArg = String(args.jd_text || "").trim();
  const companyArg = String(args.company || "").trim();
  const roleArg = String(args.role || "").trim();
  if (jdTextArg) return { jdText: jdTextArg, company: companyArg, role: roleArg };

  const lmpId = String(args.lmp_id || "").trim();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let lmp: Record<string, unknown> | null = null;
  if (lmpId) {
    const { data } = await sb.from("lmp_processes").select("*").eq("id", lmpId).maybeSingle();
    lmp = data ?? null;
  } else if (companyArg) {
    let q = sb.from("lmp_processes").select("*").ilike("company", `%${companyArg}%`);
    if (roleArg) q = q.ilike("role", `%${roleArg}%`);
    const { data } = await q.order("updated_at", { ascending: false }).limit(1);
    lmp = data?.[0] ?? null;
  }

  if (!lmp) return { jdText: "", company: companyArg, role: roleArg };

  const company = companyArg || String(lmp.company || "");
  const role = roleArg || String(lmp.role || "");
  const jdText = String((lmp as { jd_text?: string }).jd_text || "").trim();
  const jdUrl = String((lmp as { jd_url?: string }).jd_url || (lmp as { prep_doc?: string }).prep_doc || "").trim();
  if (jdText) return { jdText, company, role };

  if (jdUrl) {
    try {
      const parseRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/parse-jd`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ url: jdUrl, company, role }),
      });
      if (parseRes.ok) {
        const parsed = await parseRes.json();
        const summary = String(parsed.summary || parsed.role_summary || "").trim();
        const skills = [
          ...(Array.isArray(parsed.required_skills) ? parsed.required_skills : []),
          ...(Array.isArray(parsed.preferred_skills) ? parsed.preferred_skills : []),
        ].join(", ");
        const jdBlob = [summary, parsed.role, parsed.company, skills].filter(Boolean).join("\n");
        if (jdBlob.trim()) return { jdText: jdBlob, company, role };
      }
    } catch { /* fall through */ }
  }

  return { jdText: "", company, role };
}

export const ANALYZE_CV_SCHEMA = {
  type: "function",
  function: {
    name: "analyze_cv",
    description:
      "Analyze a candidate's CV/resume against a Job Description or LMP context. Returns ATS score, skill gaps, and improvement recommendations. Use when the user asks to analyze/review/score a CV against a role or LMP. Requires cv_text (or cv_url to plain text). Optionally pass lmp_id or company+role for JD context. AFTER calling, render a `cv-gap-card` with ONLY fields returned — do not fabricate scores.",
    parameters: {
      type: "object",
      properties: {
        candidate_name: { type: "string", description: "Candidate/student name (optional if roll_no provided)" },
        roll_no: { type: "string", description: "Student roll number / Student ID" },
        cv_text: { type: "string", description: "Full CV/resume plain text (min 100 chars). Required unless cv_url works." },
        cv_url: { type: "string", description: "Optional URL to a plain-text CV/resume" },
        lmp_id: { type: "string", description: "LMP UUID to load JD context from" },
        company: { type: "string", description: "Company name to locate LMP / JD context" },
        role: { type: "string", description: "Role title to locate LMP / JD context" },
        jd_text: { type: "string", description: "Optional raw JD text if not using lmp_id/company+role" },
      },
      additionalProperties: false,
    },
  },
};

export async function executeAnalyzeCv(args: Record<string, unknown>): Promise<string> {
  const authToken = requestState().context.authToken;
  if (!authToken) {
    return JSON.stringify({ error: "Authentication token unavailable for CV analysis." });
  }

  let candidateName = String(args.candidate_name || args.name || "").trim();
  const rollNo = String(args.roll_no || "").trim();

  if (!candidateName && rollNo) {
    const sb = getCacheClient();
    const { data } = await sb.from("students").select("name, roll_no").eq("roll_no", rollNo).maybeSingle();
    if (data?.name) candidateName = String(data.name);
  }
  if (!candidateName) {
    const q = String(args.candidate_name || args.name || "").trim();
    if (q) {
      const students = await sbFetchStudents();
      const match = students.find((s) => matchesFilter(s.Name || "", q));
      if (match?.Name) candidateName = match.Name;
    }
  }
  if (!candidateName) candidateName = "Candidate";

  const cvResolved = await resolveCvText({ ...args, candidate_name: candidateName });
  if ("error" in cvResolved) return JSON.stringify({ error: cvResolved.error });

  const jdCtx = await resolveJdContext(args);
  if (!jdCtx.jdText) {
    return JSON.stringify({
      error: "JD context required for ATS scoring. Provide jd_text, lmp_id, or company+role with an attached JD.",
      candidate_name: cvResolved.candidateName,
    });
  }

  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/cv-analysis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        cvText: cvResolved.cvText,
        jdText: jdCtx.jdText,
        mode: "both",
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return JSON.stringify({ error: `cv-analysis failed (${res.status}): ${errText.slice(0, 200)}` });
    }
    const result = await res.json();
    const ats = result.ats || {};
    const recommendations = Array.isArray(ats.resumeImprovements)
      ? ats.resumeImprovements.slice(0, 3)
      : Array.isArray(ats.skillGaps)
        ? ats.skillGaps.slice(0, 3).map((g: { recommendation?: string; skill?: string }) => g.recommendation || g.skill).filter(Boolean)
        : [];

    return JSON.stringify({
      ok: true,
      candidate_name: cvResolved.candidateName,
      company: jdCtx.company,
      role: jdCtx.role,
      ats,
      cv_gap_card: {
        type: "cv-gap-card",
        candidate_name: cvResolved.candidateName,
        lmp_company: jdCtx.company || undefined,
        lmp_role: jdCtx.role || undefined,
        ats_score: typeof ats.overallScore === "number" ? ats.overallScore : undefined,
        grade: typeof ats.grade === "string" ? ats.grade : undefined,
        missing_mandatory: Array.isArray(ats.missingMandatorySkills) ? ats.missingMandatorySkills : [],
        missing_preferred: Array.isArray(ats.missingPreferredSkills) ? ats.missingPreferredSkills : [],
        top_recommendations: recommendations,
      },
      guidance: "Render exactly one `cv-gap-card` using cv_gap_card fields. Do not invent scores or skills not present in the response.",
    });
  } catch (e) {
    return JSON.stringify({ error: `analyze_cv exception: ${(e as Error).message}` });
  }
}

async function sbFetchStudents(): Promise<Record<string, string>[]> {
  const sb = getCacheClient();
  const { data, error } = await sb
    .from("students")
    .select("id,name,email,roll_no,cohort,placement_status,lmp_count,created_at")
    .limit(2000);
  if (error) throw new Error(error.message);
  const v = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  return (data || []).map((r) => ({
    "Roll No.": v(r.roll_no),
    Name: v(r.name),
  }));
}
