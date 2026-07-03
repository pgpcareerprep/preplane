// cv-analysis: structured CV parsing and evidence-based ATS scoring.
// Accepts CV text (and optionally a JD) and returns:
//   - structured CV data (education, experience, skills, …)
//   - when JD is provided: ATS score with per-component breakdown, skill gaps,
//     missing mandatory/preferred skills, and improvement recommendations.
// No fabrication: all skills/experience reported must be found verbatim in the CV.

import { requireAuth } from "../_shared/requireAuth.ts";
import { logAiUsage, estimateTokens } from "../_shared/ai-usage.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";


const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_GEMINI = "gemini-2.5-flash";
const MODEL_OR = "qwen/qwen3-coder:free";
const MAX_CONTENT_BYTES = 80_000;

function jsonError(msg: string, status = 400, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ─── Vault helper ────────────────────────────────────────────────────────────
const _vault = new Map<string, string>();
let _vaultLoaded = false;
async function loadVault(): Promise<void> {
  if (_vaultLoaded) return;
  _vaultLoaded = true;
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "vault" }, auth: { persistSession: false } },
    );
    const { data } = await sb.from("decrypted_secrets").select("name,decrypted_secret");
    for (const row of (data ?? []) as any[]) {
      if (row.name && row.decrypted_secret) _vault.set(row.name, row.decrypted_secret.trim());
    }
  } catch { /* non-fatal */ }
}
function getEnv(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || _vault.get(name) || undefined;
}

// ─── AI call with Gemini→OpenRouter fallback ─────────────────────────────────
async function callAI(systemPrompt: string, userContent: string): Promise<string> {
  const providers = [
    { url: GEMINI_URL, key: getEnv("GEMINI_API_KEY"), model: MODEL_GEMINI },
    { url: OPENROUTER_URL, key: getEnv("OPENROUTER_API_KEY"), model: MODEL_OR },
  ];

  let lastError = "no provider available";
  for (const p of providers) {
    if (!p.key) continue;
    try {
      const resp = await fetch(p.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          model: p.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.1,
          max_tokens: 4096,
          response_format: { type: "json_object" },
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data?.choices?.[0]?.message?.content ?? "";
      }
      const errText = await resp.text().catch(() => "");
      lastError = `${p.model} HTTP ${resp.status}: ${errText.slice(0, 200)}`;
      if (![408, 429, 500, 502, 503, 504].includes(resp.status)) break;
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new Error(`CV analysis AI unavailable: ${lastError}`);
}

// ─── System prompts ───────────────────────────────────────────────────────────

const CV_PARSE_SYSTEM = `You are a structured CV extraction engine. Parse the CV and return ONLY valid JSON with this exact schema. Never fabricate information — extract only what is present.

{
  "candidateName": "string",
  "email": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "field": "string",
      "year": "string or null",
      "grade": "string or null"
    }
  ],
  "workExperience": [
    {
      "company": "string",
      "role": "string",
      "duration": "string",
      "durationMonths": "number or null",
      "responsibilities": ["string"],
      "achievements": ["string"],
      "tools": ["string"]
    }
  ],
  "skills": {
    "technical": ["string"],
    "soft": ["string"],
    "tools": ["string"],
    "languages": ["string"]
  },
  "certifications": ["string"],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "technologies": ["string"],
      "impact": "string or null"
    }
  ],
  "totalExperienceMonths": "number",
  "industries": ["string"],
  "domains": ["string"],
  "keywords": ["string"],
  "leadershipIndicators": ["string"],
  "quantifiedAchievements": ["string"]
}

Return ONLY the JSON object. No markdown, no explanation.`;

function buildAtsSystemPrompt(): string {
  return `You are an evidence-based ATS scoring engine. Score the CV against the JD using ONLY evidence found in the CV text. Never assume or infer skills not explicitly stated.

Return ONLY valid JSON with this exact schema:
{
  "overallScore": "number 0-100",
  "grade": "string (A/B/C/D/F)",
  "componentScores": {
    "mandatorySkillMatch": { "score": "number 0-100", "evidence": ["string"], "missing": ["string"] },
    "preferredSkillMatch": { "score": "number 0-100", "evidence": ["string"], "missing": ["string"] },
    "roleRelevance":       { "score": "number 0-100", "evidence": ["string"] },
    "experienceRelevance": { "score": "number 0-100", "evidence": ["string"] },
    "industryRelevance":   { "score": "number 0-100", "evidence": ["string"] },
    "toolsMatch":          { "score": "number 0-100", "evidence": ["string"], "missing": ["string"] },
    "educationMatch":      { "score": "number 0-100", "evidence": ["string"] },
    "responsibilityAlign": { "score": "number 0-100", "evidence": ["string"] },
    "achievementEvidence": { "score": "number 0-100", "evidence": ["string"] },
    "keywordCoverage":     { "score": "number 0-100", "evidence": ["string"] }
  },
  "strengths": ["string"],
  "skillGaps": [
    {
      "skill": "string",
      "mandatory": "boolean",
      "jdContext": "string",
      "recommendation": "string"
    }
  ],
  "missingMandatorySkills": ["string"],
  "missingPreferredSkills": ["string"],
  "unsupportedClaims": ["string"],
  "resumeImprovements": ["string"],
  "interviewRiskAreas": ["string"],
  "recommendedPrepTopics": ["string"],
  "hiringSummary": "string"
}

Weighting for overallScore:
- mandatorySkillMatch: 25%
- preferredSkillMatch: 15%
- roleRelevance: 15%
- experienceRelevance: 15%
- toolsMatch: 10%
- educationMatch: 5%
- responsibilityAlign: 5%
- achievementEvidence: 5%
- keywordCoverage: 5%

Return ONLY the JSON object. No markdown, no explanation.`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("POST only", 405, corsHeaders);

  await loadVault();

  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) return auth.error;

  if (!getEnv("GEMINI_API_KEY") && !getEnv("OPENROUTER_API_KEY")) {
    return jsonError("AI provider not configured", 500, corsHeaders);
  }

  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_CONTENT_BYTES) {
    return jsonError(`Payload too large (max ${MAX_CONTENT_BYTES} bytes)`, 413, corsHeaders);
  }
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (!ctype.includes("application/json")) {
    return jsonError("Content-Type must be application/json. Convert PDF/DOCX to text client-side.", 415, corsHeaders);
  }

  let body: any;
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body", 400, corsHeaders); }

  const cvText: string = (body.cvText || "").toString().trim();
  const jdText: string = (body.jdText || "").toString().trim();
  // Structured JD (from parse-jd) can be provided instead of raw text
  const jdStructured: any = body.jdStructured ?? null;
  const mode: "parse" | "ats" | "both" = body.mode ?? (jdText || jdStructured ? "both" : "parse");

  if (!cvText) return jsonError("cvText is required", 400, corsHeaders);
  if (cvText.length < 100) return jsonError("cvText is too short to be a valid CV", 400, corsHeaders);

  const t0 = Date.now();

  try {
    // ── Step 1: Parse CV ──────────────────────────────────────────────────────
    const cvRaw = await callAI(
      CV_PARSE_SYSTEM,
      `Parse this CV:\n\n${cvText.slice(0, 20000)}`,
    );

    let parsedCv: any;
    try {
      parsedCv = JSON.parse(cvRaw);
    } catch {
      return jsonError("CV parsing returned invalid JSON — please retry", 400, corsHeaders);
    }

    if (mode === "parse") {
      logAiUsage({
        userId: auth.user.id, feature: "cv-parse", model: MODEL_GEMINI,
        promptTokens: estimateTokens(cvText), responseTokens: estimateTokens(cvRaw),
        latencyMs: Date.now() - t0, status: "ok",
      });
      return new Response(JSON.stringify({ ok: true, mode: "parse", cv: parsedCv }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: ATS Scoring ──────────────────────────────────────────────────
    const effectiveJd = jdStructured
      ? `STRUCTURED JD:\n${JSON.stringify(jdStructured, null, 2)}`
      : `RAW JD:\n${jdText.slice(0, 10000)}`;

    const atsRaw = await callAI(
      buildAtsSystemPrompt(),
      `${effectiveJd}\n\n---\n\nCV (structured):\n${JSON.stringify(parsedCv, null, 2)}\n\nCV (raw text for evidence verification):\n${cvText.slice(0, 12000)}`,
    );

    let atsResult: any;
    try {
      atsResult = JSON.parse(atsRaw);
    } catch {
      return jsonError("ATS scoring returned invalid JSON — please retry", 400, corsHeaders);
    }

    logAiUsage({
      userId: auth.user.id, feature: "cv-ats", model: MODEL_GEMINI,
      promptTokens: estimateTokens(cvText + jdText), responseTokens: estimateTokens(atsRaw),
      latencyMs: Date.now() - t0, status: "ok",
    });

    return new Response(JSON.stringify({
      ok: true,
      mode,
      cv: parsedCv,
      ats: atsResult,
      metadata: { analysedAt: new Date().toISOString(), latencyMs: Date.now() - t0 },
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (e) {
    logAiUsage({
      userId: auth.user.id, feature: "cv-analysis", model: MODEL_GEMINI,
      promptTokens: estimateTokens(cvText), latencyMs: Date.now() - t0,
      status: "error", errorMessage: (e as Error).message.slice(0, 200),
    });
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
