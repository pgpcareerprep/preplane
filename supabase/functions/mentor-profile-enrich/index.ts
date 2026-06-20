// Live mentor profile enrichment — Zero-Spend provider stack + Gemini (free tier).
//
// Fetches public info via free search/scrape providers (no paid Firecrawl).
// LinkedIn is never scraped directly — search snippets only.
// Results cached on public.mentors.enrichment for 30 days.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { getAiGatewayUrl } from "../_shared/appConfig.ts";
import { GEMINI_FREE_MODEL } from "../_shared/providers/config.ts";
import { searchHitsToCorpus } from "../_shared/providers/discovery/gemini-grounding.ts";
import { cachedScrape, cachedSearch } from "../_shared/providers/pipeline.ts";
import { loadSecret } from "../_shared/providers/secrets.ts";

const AI_GATEWAY = getAiGatewayUrl();
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Enrichment = {
  overview: string;
  experience: { role: string; company: string; years: string }[];
  languages: string[];
  decisionRationale: { rationale: string; tags: string[] };
  remuneration: { min_inr: number | null; max_inr: number | null; notes: string };
  sources: string[];
  fetched_at: string;
};

function jsonResp(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function structureWithAi(
  apiKey: string,
  ctx: { name: string; role: string; company: string; sources: string[]; corpus: string },
): Promise<Enrichment | null> {
  const system = `You extract structured mentor profile data from raw public web content.
Strict rules:
- ONLY use facts literally present in the provided source material.
- Never invent companies, roles, years, languages, or salary numbers.
- If a field is not supported by the sources, return an empty string, empty array, or null.
- "remuneration" should reflect typical compensation for the mentor's role/seniority based on the sources, in INR. Leave numbers null if no signal.
- "decisionRationale.rationale" is a 1-2 sentence explanation of why this mentor is a strong fit, grounded in the sources.
- "languages" must only include languages explicitly mentioned in the sources.
Return JSON only.`;

  const user = `Mentor: ${ctx.name}
Stated role: ${ctx.role}
Stated company: ${ctx.company}
Source URLs: ${ctx.sources.join(", ") || "(none)"}

SOURCE MATERIAL:
${ctx.corpus || "(no source material available)"}

Output JSON schema:
{
  "overview": "string (2-3 sentences, factual)",
  "experience": [{ "role": "string", "company": "string", "years": "string e.g. '2020 - 2023' or '3 yrs'" }],
  "languages": ["string"],
  "decisionRationale": { "rationale": "string", "tags": ["string"] },
  "remuneration": { "min_inr": number|null, "max_inr": number|null, "notes": "string" }
}`;

  try {
    const r = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_FREE_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return {
      overview: String(parsed.overview ?? "").trim(),
      experience: Array.isArray(parsed.experience)
        ? parsed.experience
            .map((e: Record<string, unknown>) => ({
              role: String(e?.role ?? "").trim(),
              company: String(e?.company ?? "").trim(),
              years: String(e?.years ?? "").trim(),
            }))
            .filter((e: { role: string; company: string }) => e.role || e.company)
            .slice(0, 8)
        : [],
      languages: Array.isArray(parsed.languages)
        ? parsed.languages.map((l: unknown) => String(l).trim()).filter(Boolean).slice(0, 6)
        : [],
      decisionRationale: {
        rationale: String(parsed.decisionRationale?.rationale ?? "").trim(),
        tags: Array.isArray(parsed.decisionRationale?.tags)
          ? parsed.decisionRationale.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 6)
          : [],
      },
      remuneration: {
        min_inr: Number.isFinite(Number(parsed.remuneration?.min_inr)) ? Number(parsed.remuneration.min_inr) : null,
        max_inr: Number.isFinite(Number(parsed.remuneration?.max_inr)) ? Number(parsed.remuneration.max_inr) : null,
        notes: String(parsed.remuneration?.notes ?? "").trim(),
      },
      sources: ctx.sources,
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  const log = createLogger("mentor-profile-enrich", req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = await requireAuth(req, cors);
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonResp({ error: "Invalid JSON" }, 400, cors); }

  const mentorId: string | null = (body?.mentorId as string) ?? null;
  const refresh = body?.refresh === true;

  const GEMINI_API_KEY = (await loadSecret("GEMINI_API_KEY")) ?? Deno.env.get("GEMINI_API_KEY")?.trim() ?? null;
  if (!GEMINI_API_KEY) {
    return jsonResp({ error: "Missing GEMINI_API_KEY" }, 500, cors);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let name: string = String(body?.name ?? "").trim();
  let role: string = String(body?.role ?? "").trim();
  let company: string = String(body?.company ?? "").trim();
  let linkedin: string | null = (body?.linkedin as string) ?? null;
  let existing: Record<string, unknown> | null = null;
  let mentorRowFound = false;

  if (mentorId) {
    const { data, error } = await admin
      .from("mentors")
      .select("id, name, role, company, linkedin, enrichment, enrichment_updated_at")
      .eq("id", mentorId)
      .maybeSingle();
    if (error) return jsonResp({ error: error.message }, 500, cors);
    if (data) {
      mentorRowFound = true;
      existing = data;
      name = name || data.name || "";
      role = role || data.role || "";
      company = company || data.company || "";
      linkedin = linkedin || data.linkedin || null;

      if (!refresh && data.enrichment && data.enrichment_updated_at) {
        const age = Date.now() - new Date(data.enrichment_updated_at).getTime();
        if (age < CACHE_TTL_MS) {
          return jsonResp({ enrichment: data.enrichment, cached: true }, 200, cors);
        }
      }
    }
  }

  if (!name) return jsonResp({ error: "Missing mentor name" }, 400, cors);

  const sources: string[] = [];
  const corpora: string[] = [];

  // LinkedIn: search snippets only — never scrape linkedin.com
  if (linkedin) {
    const handle = linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "").replace(/\/$/, "");
    const q = `"${name}" ${handle} linkedin profile`;
    const hits = await cachedSearch(q, 4, log);
    if (hits.length) {
      sources.push(linkedin.startsWith("http") ? linkedin : `https://www.linkedin.com/in/${handle}`);
      corpora.push(`# LinkedIn search snippets\n${searchHitsToCorpus(hits)}`);
    }
  }

  const q = [name, role, company, "topmate OR adplist mentor"].filter(Boolean).join(" ");
  if (q) {
    const hits = await cachedSearch(q, 6, log);
    if (hits.length) {
      sources.push(`search:${q}`);
      corpora.push(`# Web search results\n${searchHitsToCorpus(hits)}`);

      // Scrape first non-LinkedIn booking profile for richer corpus
      const scrapeTarget = hits.find((h) =>
        !/linkedin\.com/i.test(h.url) &&
        (/topmate\.io|adplist\.org|superpeer\.com/i.test(h.url)),
      );
      if (scrapeTarget) {
        const scraped = await cachedScrape(scrapeTarget.url, log, GEMINI_API_KEY);
        if (scraped?.markdown) {
          sources.push(scrapeTarget.url);
          corpora.push(`# Profile page (${scrapeTarget.url})\n${scraped.markdown.slice(0, 6000)}`);
        }
      }
    }
  }

  const enrichment = await structureWithAi(GEMINI_API_KEY, {
    name, role, company,
    sources,
    corpus: corpora.join("\n\n---\n\n"),
  });

  if (!enrichment) {
    return jsonResp({
      enrichment: {
        overview: "",
        experience: [],
        languages: [],
        decisionRationale: { rationale: "", tags: [] },
        remuneration: { min_inr: null, max_inr: null, notes: "" },
        sources,
        fetched_at: new Date().toISOString(),
      },
      cached: false,
      empty: true,
    }, 200, cors);
  }

  if (mentorId && mentorRowFound && existing) {
    try {
      await admin.from("mentors").update({
        enrichment,
        enrichment_updated_at: new Date().toISOString(),
      }).eq("id", mentorId);
    } catch (e) {
      log.warn("cache_write_failed", { err_msg: (e as Error).message });
    }
  }

  return jsonResp({ enrichment, cached: false }, 200, cors);
});
