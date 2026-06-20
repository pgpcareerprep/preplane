import { estimateTokens, logAiUsage } from "../ai-usage.ts";
import { GEMINI_API_URL, GEMINI_FREE_MODEL } from "./config.ts";

export const EXTRACTION_SCHEMA_PROMPT =
  "Extract the profile owner's professional info as it literally appears on the page. " +
  "Return null for any field NOT literally present. Do not guess. Do not infer email or phone " +
  "from the person's name. Do not invent companies, roles, prices, or experience.";

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    current_role: { type: "string" },
    company: { type: "string" },
    industry: { type: "string" },
    skills: { type: "array", items: { type: "string" } },
    seniority_level: { type: "string" },
    years_experience: { type: "number" },
    email: { type: "string" },
    phone: { type: "string" },
    pricing: {
      type: "object",
      properties: {
        amount: { type: "number" },
        currency: { type: "string" },
        unit: { type: "string" },
      },
    },
    linkedin: { type: "string" },
    booking_url: { type: "string" },
  },
};

export async function callGeminiJson(
  apiKey: string,
  system: string,
  user: string,
  signal?: AbortSignal,
  userId?: string | null,
): Promise<string | null> {
  const started = Date.now();
  try {
    const res = await fetch(GEMINI_API_URL, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_FREE_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      await logAiUsage({
        userId,
        feature: "mentor_search",
        model: GEMINI_FREE_MODEL,
        latencyMs,
        status: "error",
        errorMessage: `HTTP ${res.status}`,
      });
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? null;
    await logAiUsage({
      userId,
      feature: "mentor_search",
      model: GEMINI_FREE_MODEL,
      promptTokens: estimateTokens(system + user),
      responseTokens: estimateTokens(content),
      latencyMs,
      status: "ok",
    });
    return content;
  } catch (e) {
    await logAiUsage({
      userId,
      feature: "mentor_search",
      model: GEMINI_FREE_MODEL,
      latencyMs: Date.now() - started,
      status: "error",
      errorMessage: (e as Error).message,
    });
    return null;
  }
}

export async function extractFromMarkdown(
  apiKey: string,
  markdown: string,
  userId?: string | null,
): Promise<Record<string, unknown>> {
  const sys =
    "You extract structured mentor profile fields from markdown. " +
    "Return ONLY a JSON object matching the schema. " +
    "Every field must be literally supported by the markdown or set to null. NEVER invent data.";
  const user = JSON.stringify({
    instruction: EXTRACTION_SCHEMA_PROMPT,
    schema: EXTRACTION_JSON_SCHEMA,
    markdown: markdown.slice(0, 8000),
  });
  const raw = await callGeminiJson(apiKey, sys, user, AbortSignal.timeout(25000), userId);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function validateExtraction(
  apiKey: string,
  markdown: string,
  extracted: Record<string, unknown>,
  userId?: string | null,
): Promise<Record<string, unknown>> {
  const sys =
    "You verify whether each field in an extracted profile is literally supported by the source markdown. " +
    "Return ONLY a JSON object with the same shape as the input. For each field, KEEP the value only if it " +
    "appears verbatim (or as an obvious normalised form, e.g. trimmed whitespace) in the markdown. " +
    "Otherwise set it to null. NEVER invent emails, phones, prices, companies, or roles. " +
    "Treat skills as an array of strings actually mentioned on the page; drop any not present.";
  const user = JSON.stringify({
    markdown: markdown.slice(0, 6000),
    extracted,
  });
  const raw = await callGeminiJson(apiKey, sys, user, AbortSignal.timeout(20000), userId);
  if (!raw) return extracted;
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object") return j as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  return extracted;
}

export type RankInput = {
  name: string;
  snippet: string;
  scraped: string;
  role: string;
  company: string;
  industry: string;
  skills: string[];
};

export type RankOutput = {
  confidence: number;
  matched_fields: string[];
  evidence: string;
};

export async function rerankMentors(
  apiKey: string,
  ctx: { role: string; company: string; industry: string; skills: string[]; jdText: string },
  mentors: RankInput[],
  userId?: string | null,
): Promise<RankOutput[]> {
  if (!mentors.length) return [];
  const sys =
    "You score mentor relevance using ONLY the provided snippet and scraped text. " +
    "Return ONLY JSON: {\"results\":[{\"index\":number,\"confidence\":0-100,\"matched_fields\":string[],\"evidence\":string}]}. " +
    "confidence reflects how well the text supports fit for the target role/company/skills. " +
    "matched_fields may include role, company, industry, skills. " +
    "evidence must quote or paraphrase ONLY facts present in the text. NEVER add new facts.";
  const user = JSON.stringify({
    target: ctx,
    mentors: mentors.map((m, i) => ({ index: i, ...m })),
  });
  const raw = await callGeminiJson(apiKey, sys, user, AbortSignal.timeout(30000), userId);
  if (!raw) return mentors.map(() => ({ confidence: 50, matched_fields: [], evidence: "" }));
  try {
    const j = JSON.parse(raw) as { results?: RankOutput[] & { index?: number }[] };
    const out: RankOutput[] = mentors.map(() => ({ confidence: 50, matched_fields: [], evidence: "" }));
    for (const r of j.results ?? []) {
      const idx = typeof (r as { index?: number }).index === "number" ? (r as { index: number }).index : -1;
      if (idx < 0 || idx >= out.length) continue;
      out[idx] = {
        confidence: Math.min(100, Math.max(0, Number((r as RankOutput).confidence) || 0)),
        matched_fields: Array.isArray((r as RankOutput).matched_fields) ? (r as RankOutput).matched_fields : [],
        evidence: String((r as RankOutput).evidence ?? "").slice(0, 300),
      };
    }
    return out;
  } catch {
    return mentors.map(() => ({ confidence: 50, matched_fields: [], evidence: "" }));
  }
}

export async function expandQueries(
  apiKey: string | null,
  role: string,
  company: string,
  industry: string,
  skills: string[],
  seniority: string,
  jdText: string,
  regionLabel: string,
  userId?: string | null,
): Promise<string[]> {
  const fallback: string[] = [];
  const regionSuffix = regionLabel ? ` "${regionLabel}"` : "";
  if (role) {
    if (company) fallback.push(`site:linkedin.com/in "${role}" "${company}"${regionSuffix}`);
    if (industry) fallback.push(`site:linkedin.com/in "${role}" "${industry}"${regionSuffix}`);
    fallback.push(`site:linkedin.com/in "${role}"${seniority ? ` "${seniority}"` : ""}${regionSuffix}`);
    if (company) fallback.push(`"ex-${company}" "${role}" site:linkedin.com/in`);
    fallback.push(`site:topmate.io "${role}"${industry ? ` "${industry}"` : ""}${regionSuffix}`);
    fallback.push(`site:adplist.org mentor "${role}"${regionSuffix}`);
    if (industry) fallback.push(`site:superpeer.com "${role}" "${industry}"${regionSuffix}`);
    if (skills.length) {
      fallback.push(`site:topmate.io "${role}" "${skills[0]}" mentor${regionSuffix}`);
      fallback.push(`site:adplist.org "${role}" "${skills[0]}"${regionSuffix}`);
    }
  }

  if (!apiKey) return fallback;

  const sys =
    "You produce Google search queries that surface real professional profiles for interview prep mentors. " +
    "Return ONLY a JSON object: {\"queries\": string[]}. Exactly 8 queries: 2 site:linkedin.com/in, " +
    "2 site:topmate.io, 2 site:adplist.org, 2 site:superpeer.com. " +
    "Weight the job description excerpt when present. Include role verbatim in quotes. " +
    "Include company, industry, top skills, seniority, and region when provided. Never invent companies.";
  const user = JSON.stringify({
    role, company, industry, skills: skills.slice(0, 8), seniority, region: regionLabel,
    jd_excerpt: jdText.slice(0, 2500),
  });
  const raw = await callGeminiJson(apiKey, sys, user, AbortSignal.timeout(15000), userId);
  if (!raw) return fallback;
  try {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j?.queries) ? j.queries : [];
    const cleaned = arr
      .filter((q: unknown): q is string => typeof q === "string" && q.includes("site:"))
      .slice(0, 8);
    const merged = Array.from(new Set([...cleaned, ...fallback]));
    return merged.length ? merged : fallback;
  } catch {
    return fallback;
  }
}
