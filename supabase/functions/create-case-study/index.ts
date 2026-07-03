// create-case-study: generates a structured interview case-study brief.
// Independently callable; also used by the create_case_study copilot tool.

import { requireAuth } from "../_shared/requireAuth.ts";
import { logAiUsage, estimateTokens } from "../_shared/ai-usage.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";


const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_GEMINI = "gemini-2.5-flash";
const MODEL_OR = "qwen/qwen3-coder:free";

function jsonError(msg: string, status = 400, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

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
    for (const row of (data ?? []) as { name?: string; decrypted_secret?: string }[]) {
      if (row.name && row.decrypted_secret) _vault.set(row.name, row.decrypted_secret.trim());
    }
  } catch { /* non-fatal */ }
}
function getEnv(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || _vault.get(name) || undefined;
}

const SYSTEM_PROMPT = `You are an expert interview coach for MBA/placement prep.
Generate a realistic case-study brief for interview preparation.
Return ONLY valid JSON with this exact shape:
{
  "situation": "2-4 sentences of business context",
  "prompt": "The ask given to the candidate (what they must solve/decide)",
  "rubric": [
    { "criterion": "string", "weight": 0.25, "description": "what good looks like" }
  ],
  "model_answer_outline": ["bullet 1", "bullet 2", "bullet 3"]
}
Rules:
- Rubric weights must sum to 1.0 (4-5 criteria).
- Tailor to the company, role, and domain.
- Do not invent specific confidential company data; use plausible public-style scenarios.
- model_answer_outline: 4-6 high-level bullets, not a full essay.`;

async function callAI(userContent: string): Promise<string> {
  const providers = [
    { url: GEMINI_URL, key: getEnv("GEMINI_API_KEY"), model: MODEL_GEMINI },
    { url: OPENROUTER_URL, key: getEnv("OPENROUTER_API_KEY"), model: MODEL_OR },
  ];
  let lastErr = "AI unavailable";
  for (const p of providers) {
    if (!p.key) continue;
    try {
      const resp = await fetch(p.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model: p.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          temperature: 0.4,
          response_format: { type: "json_object" },
        }),
      });
      if (!resp.ok) {
        lastErr = await resp.text().catch(() => `HTTP ${resp.status}`);
        continue;
      }
      const data = await resp.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(lastErr);
}

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

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body", 400, corsHeaders); }

  const company = String(body.company || "").trim();
  const role = String(body.role || "").trim();
  const domain = String(body.domain || "").trim();
  const jdText = String(body.jd_text || "").trim();

  if (!company) return jsonError("company is required", 400, corsHeaders);
  if (!role) return jsonError("role is required", 400, corsHeaders);

  const userPrompt = [
    `Company: ${company}`,
    `Role: ${role}`,
    domain ? `Domain: ${domain}` : "",
    jdText ? `Job description excerpt:\n${jdText.slice(0, 8000)}` : "",
    "Create an interview case study appropriate for this placement context.",
  ].filter(Boolean).join("\n");

  const t0 = Date.now();
  try {
    const raw = await callAI(userPrompt);
    let brief: Record<string, unknown>;
    try {
      brief = JSON.parse(raw);
    } catch {
      return jsonError("Case study generation returned invalid JSON — please retry", 400, corsHeaders);
    }

    logAiUsage({
      userId: auth.user.id,
      feature: "create-case-study",
      model: MODEL_GEMINI,
      promptTokens: estimateTokens(userPrompt),
      responseTokens: estimateTokens(raw),
      latencyMs: Date.now() - t0,
      status: "ok",
    });

    return new Response(JSON.stringify({
      ok: true,
      company,
      role,
      domain: domain || undefined,
      brief,
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    logAiUsage({
      userId: auth.user.id,
      feature: "create-case-study",
      model: MODEL_GEMINI,
      promptTokens: estimateTokens(userPrompt),
      latencyMs: Date.now() - t0,
      status: "error",
      errorMessage: (e as Error).message.slice(0, 200),
    });
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
