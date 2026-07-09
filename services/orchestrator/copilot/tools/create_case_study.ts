import { requestState } from "../requestContext.ts";

export type CaseStudyBrief = {
  situation: string;
  prompt: string;
  rubric: { criterion: string; weight: number; description: string }[];
  model_answer_outline: string[];
};

export const CREATE_CASE_STUDY_SCHEMA = {
  type: "function",
  function: {
    name: "create_case_study",
    description:
      "Generate a structured interview case-study brief for a company/role/domain. Returns situation, prompt, evaluation rubric, and model-answer outline. Use when the user asks to create/prepare a case study. AFTER calling, render a `case-study-card` with ONLY returned fields.",
    parameters: {
      type: "object",
      properties: {
        company: { type: "string", description: "Target company" },
        role: { type: "string", description: "Target role title" },
        domain: { type: "string", description: "Domain (e.g. PM, Finance, Marketing)" },
        jd_text: { type: "string", description: "Optional job description text for context" },
      },
      required: ["company", "role"],
      additionalProperties: false,
    },
  },
};

export function validateCreateCaseStudyArgs(args: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  const company = String(args.company || "").trim();
  const role = String(args.role || "").trim();
  if (!company) return { ok: false, error: "company is required" };
  if (!role) return { ok: false, error: "role is required" };
  return { ok: true };
}

export async function executeCreateCaseStudy(args: Record<string, unknown>): Promise<string> {
  const validated = validateCreateCaseStudyArgs(args);
  if (!validated.ok) return JSON.stringify({ error: validated.error });

  const authToken = requestState().context.authToken;
  if (!authToken) {
    return JSON.stringify({ error: "Authentication token unavailable for case study generation." });
  }

  const company = String(args.company).trim();
  const role = String(args.role).trim();
  const domain = String(args.domain || "").trim();
  const jdText = String(args.jd_text || "").trim();

  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/create-case-study`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
      },
      body: JSON.stringify({ company, role, domain: domain || undefined, jd_text: jdText || undefined }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("create_case_study edge call failed", { status: res.status, body: errText.slice(0, 300) });
      return JSON.stringify({ error: "Failed to generate case study. Please try again." });
    }
    const result = await res.json();
    const brief = result?.brief as CaseStudyBrief | undefined;
    if (!result?.ok || !brief?.situation || !brief?.prompt) {
      return JSON.stringify({ error: "Failed to generate case study. Please try again." });
    }
    return JSON.stringify({
      ok: true,
      company,
      role,
      domain: domain || result.domain,
      brief,
      case_study_card: {
        type: "case-study-card",
        company,
        role,
        domain: domain || result.domain,
        situation: brief.situation,
        prompt: brief.prompt,
        rubric: brief.rubric,
        model_answer_outline: brief.model_answer_outline,
      },
      instruction: "Render exactly one case-study-card block from case_study_card. Do not fabricate content.",
    });
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (name === "TimeoutError" || name === "AbortError") {
      return JSON.stringify({ error: "Case study generation timed out, try again" });
    }
    return JSON.stringify({ error: `create_case_study exception: ${(e as Error).message}` });
  }
}
