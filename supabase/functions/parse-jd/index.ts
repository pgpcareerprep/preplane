// Edge function: parse-jd
// Uses Lovable AI Gateway to turn raw JD text (or a URL) into structured JD data.
import { requireAuth } from "../_shared/requireAuth.ts";
import { logAiUsage, estimateTokens } from "../_shared/ai-usage.ts";


import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { DEFAULT_APP_ORIGIN, getAiGatewayUrl } from "../_shared/appConfig.ts";
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = getAiGatewayUrl();
const MODEL = "gemini-2.5-flash";
const MAX_TEXT_BYTES = 120_000;          // ~120KB raw text upper bound
const MAX_URL_FETCH_BYTES = 5 * 1024 * 1024; // 5MB ceiling on fetched URL bodies

type ParsedJD = {
  role: string;
  company: string;
  domain: string;
  seniority: "Intern" | "Junior" | "Mid" | "Senior" | "Lead" | "Director" | "VP" | "Unspecified";
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  qualifications: string[];
  summary: string;
  yearsExperience?: string;
  location?: string;
  employmentType?: string;
  confidence: number;
};

function jsonError(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchUrlText(url: string): Promise<string> {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 LMP-JD-Parser" },
    });
    if (!r.ok) return "";
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("text") && !ct.includes("html") && !ct.includes("json")) return "";
    const html = await r.text();
    // Strip tags + scripts/styles
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.slice(0, 20000);
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("POST only", 405);

  // Auth: any approved user (admin/allocator/poc) can parse a JD.
  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) return auth.error;

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return jsonError("GEMINI_API_KEY not configured", 500);

  // Reject oversized payloads up front.
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_URL_FETCH_BYTES) {
    return jsonError(`Payload too large (max ${MAX_URL_FETCH_BYTES} bytes)`, 413);
  }
  // Only JSON is accepted; binary PDF/DOCX uploads must be parsed client-side first.
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (!ctype.includes("application/json")) {
    return jsonError("Content-Type must be application/json. Convert PDF/DOCX to text on the client first.", 415);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const role: string = (body.role || "").toString().trim();
  const company: string = (body.company || "").toString().trim();
  const domainHint: string = (body.domain || "").toString().trim();
  let text: string = (body.text || "").toString();
  const url: string = (body.url || "").toString().trim();

  if (text.length > MAX_TEXT_BYTES) {
    return jsonError(`text field too large (max ${MAX_TEXT_BYTES} chars)`, 413);
  }

  if (!text && url) {
    text = await fetchUrlText(url);
  }
  text = text.slice(0, 12000).trim();

  if (text.length < 30) {
    // Not enough content — return a minimal stub so caller can still proceed.
    const fallback: ParsedJD = {
      role,
      company,
      domain: domainHint,
      seniority: "Unspecified",
      requiredSkills: [],
      preferredSkills: [],
      responsibilities: [],
      qualifications: [],
      summary: text || `${role} at ${company}`.trim(),
      confidence: 20,
    };
    return new Response(JSON.stringify({ parsed: fallback, lowContent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const systemPrompt = `You are a precise JD (Job Description) parser. Extract structured info from the provided JD text. Return ONLY valid JSON matching the schema. Do not invent skills not present. If a field is unknown, use an empty string or empty array. Skills must be short (1-4 words), lowercase, deduplicated. Seniority must be one of: Intern, Junior, Mid, Senior, Lead, Director, VP, Unspecified.`;

  const userPrompt = `Hints (may be empty): role="${role}", company="${company}", domain="${domainHint}".\n\n--- JD TEXT START ---\n${text}\n--- JD TEXT END ---`;

  const tool = {
    type: "function",
    function: {
      name: "submit_parsed_jd",
      description: "Submit the structured JD parse result.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: [
          "role", "company", "domain", "seniority",
          "requiredSkills", "preferredSkills",
          "responsibilities", "qualifications",
          "summary", "confidence",
        ],
        properties: {
          role: { type: "string" },
          company: { type: "string" },
          domain: { type: "string", description: "Functional domain e.g. Product, Marketing, Engineering, Finance, Operations, Sales, Design, Data, Strategy, HR" },
          seniority: { type: "string", enum: ["Intern", "Junior", "Mid", "Senior", "Lead", "Director", "VP", "Unspecified"] },
          requiredSkills: { type: "array", items: { type: "string" }, maxItems: 25 },
          preferredSkills: { type: "array", items: { type: "string" }, maxItems: 25 },
          responsibilities: { type: "array", items: { type: "string" }, maxItems: 15 },
          qualifications: { type: "array", items: { type: "string" }, maxItems: 15 },
          summary: { type: "string", description: "2-3 sentence summary" },
          yearsExperience: { type: "string" },
          location: { type: "string" },
          employmentType: { type: "string" },
          confidence: { type: "number", description: "0-100 confidence in parse" },
        },
      },
    },
  };

  const aiStart = Date.now();
  let aiResp: Response;
  try {
    aiResp = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "submit_parsed_jd" } },
      }),
    });
  } catch (e) {
    await logAiUsage({
      userId: auth.user.id, feature: "parse_jd", model: MODEL,
      latencyMs: Date.now() - aiStart, status: "error",
      errorMessage: `gateway fetch failed: ${e}`,
    });
    return jsonError(`AI gateway fetch failed: ${e}`, 502);
  }

  if (!aiResp.ok) {
    const status =
      aiResp.status === 429 ? "rate_limited" :
      aiResp.status === 402 ? "credits_exhausted" : "error";
    const errBody = await aiResp.text().catch(() => "");
    await logAiUsage({
      userId: auth.user.id, feature: "parse_jd", model: MODEL,
      promptTokens: estimateTokens(systemPrompt + userPrompt),
      latencyMs: Date.now() - aiStart, status,
      errorMessage: errBody.slice(0, 300),
    });
    if (aiResp.status === 429) return jsonError("Rate limit exceeded. Try again shortly.", 429);
    if (aiResp.status === 402) return jsonError("AI credits exhausted. Add credits in Workspace Settings.", 402);
    return jsonError(`AI gateway error: ${errBody.slice(0, 300)}`, 502);
  }

  const data = await aiResp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  let parsed: ParsedJD | null = null;
  if (call?.function?.arguments) {
    try {
      parsed = JSON.parse(call.function.arguments) as ParsedJD;
    } catch {
      parsed = null;
    }
  }

  // Log usage — prefer real token counts from gateway, fall back to estimate.
  const usage = data?.usage ?? {};
  const promptTokens = Number(usage.prompt_tokens) || estimateTokens(systemPrompt + userPrompt);
  const responseTokens = Number(usage.completion_tokens) || estimateTokens(call?.function?.arguments || "");
  await logAiUsage({
    userId: auth.user.id, feature: "parse_jd", model: MODEL,
    promptTokens, responseTokens,
    totalTokens: Number(usage.total_tokens) || (promptTokens + responseTokens),
    latencyMs: Date.now() - aiStart,
    status: parsed ? "ok" : "error",
    errorMessage: parsed ? null : "no structured result",
  });

  if (!parsed) {
    return jsonError("AI returned no structured result", 502);
  }


  // Apply hint fallbacks
  parsed.role = parsed.role || role;
  parsed.company = parsed.company || company;
  parsed.domain = parsed.domain || domainHint;
  parsed.seniority = parsed.seniority || "Unspecified";
  parsed.requiredSkills = (parsed.requiredSkills || []).map((s) => s.toLowerCase().trim()).filter(Boolean);
  parsed.preferredSkills = (parsed.preferredSkills || []).map((s) => s.toLowerCase().trim()).filter(Boolean);
  parsed.confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 70));

  return new Response(JSON.stringify({ parsed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
