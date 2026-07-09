import { estimateTokens, logAiUsage } from "../../../../supabase/functions/_shared/ai-usage.ts";
import { GEMINI_FREE_MODEL } from "../../../../supabase/functions/_shared/providers/config.ts";
import { readCache, sha256Hex, writeCache } from "../cache.ts";
import { getEnv } from "../secrets.ts";
import { requestState } from "../requestContext.ts";

const WEB_SEARCH_TTL_SEC = 900; // 15 minutes
const WEB_SEARCH_TIMEOUT_MS = 8_000;
const WEB_SEARCH_HOURLY_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;

export type WebSearchSource = { title: string; url: string };
export type WebSearchResult = { answer: string; sources: WebSearchSource[] };

type GroundingChunk = {
  web?: { uri?: string; title?: string };
  uri?: string;
  title?: string;
};

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function emptyResult(note: string): WebSearchResult {
  return { answer: note, sources: [] };
}

const _userWebSearchWindows = new Map<string, { count: number; resetAt: number }>();

export function checkWebSearchRateLimit(userId: string | null | undefined): { allowed: boolean; message?: string } {
  if (!userId) return { allowed: true };
  const now = Date.now();
  let entry = _userWebSearchWindows.get(userId);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + HOUR_MS };
    _userWebSearchWindows.set(userId, entry);
  }
  if (entry.count >= WEB_SEARCH_HOURLY_LIMIT) {
    return {
      allowed: false,
      message:
        "Web search rate limit reached (20 searches per hour). Try again later or use platform DB tools for PrepLane data.",
    };
  }
  entry.count++;
  return { allowed: true };
}

function extractSources(chunks: GroundingChunk[] | undefined): WebSearchSource[] {
  const sources: WebSearchSource[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks ?? []) {
    const url = String(chunk.web?.uri ?? chunk.uri ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = String(chunk.web?.title ?? chunk.title ?? url).trim() || url;
    sources.push({ title, url });
  }
  return sources;
}

async function readWebSearchCache(normalizedQuery: string): Promise<WebSearchResult | null> {
  const key = `web_search:${await sha256Hex(normalizedQuery)}`;
  const cached = await readCache(key);
  if (!cached?.text) return null;
  try {
    const parsed = JSON.parse(cached.text) as WebSearchResult;
    if (typeof parsed.answer === "string" && Array.isArray(parsed.sources)) return parsed;
  } catch { /* ignore corrupt cache */ }
  return null;
}

async function writeWebSearchCache(normalizedQuery: string, result: WebSearchResult): Promise<void> {
  const key = `web_search:${await sha256Hex(normalizedQuery)}`;
  await writeCache(key, JSON.stringify(result), WEB_SEARCH_TTL_SEC);
}

export async function webSearch(query: string): Promise<WebSearchResult> {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return emptyResult("Please provide a search query.");
  }

  const userId = requestState().context.userId ?? null;
  const rate = checkWebSearchRateLimit(userId);
  if (!rate.allowed) {
    return emptyResult(rate.message || "Web search rate limit reached.");
  }

  const cached = await readWebSearchCache(normalized);
  if (cached) return cached;

  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) {
    return emptyResult("Live web search is unavailable right now (API key not configured).");
  }

  const t0 = Date.now();
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FREE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text:
                `Use Google Search to answer this question with current, factual information. ` +
                `Be concise (2-4 sentences). Do not invent facts.\n\nQuestion: ${query.trim()}`,
            }],
          }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
      },
    );

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.warn(`[web_search] Gemini ${resp.status}: ${errText.slice(0, 200)}`);
      await logAiUsage({
        userId,
        feature: "copilot_web_search",
        model: GEMINI_FREE_MODEL,
        promptTokens: estimateTokens(query),
        latencyMs: Date.now() - t0,
        status: resp.status === 429 ? "rate_limited" : "error",
        errorMessage: `HTTP ${resp.status}`,
      });
      return emptyResult("I couldn't fetch live web results right now. Please try again shortly.");
    }

    const data = await resp.json() as Record<string, unknown>;
    const candidate = (data?.candidates as Array<Record<string, unknown>>)?.[0];
    const parts: unknown[] = (candidate?.content as { parts?: unknown[] })?.parts ?? [];
    const answer = parts
      .map((p) => (typeof (p as { text?: string }).text === "string" ? (p as { text: string }).text : ""))
      .join("\n")
      .trim();

    const groundingMeta = candidate?.groundingMetadata as { groundingChunks?: GroundingChunk[] } | undefined;
    const sources = extractSources(groundingMeta?.groundingChunks);

    const result: WebSearchResult = {
      answer: answer || "No synthesized answer was returned from web search.",
      sources,
    };

    await logAiUsage({
      userId,
      feature: "copilot_web_search",
      model: GEMINI_FREE_MODEL,
      promptTokens: estimateTokens(query),
      responseTokens: estimateTokens(result.answer),
      latencyMs: Date.now() - t0,
      status: "ok",
      metadata: { source_count: sources.length },
    });

    await writeWebSearchCache(normalized, result);
    return result;
  } catch (err) {
    console.warn("[web_search] failed:", (err as Error).message);
    await logAiUsage({
      userId,
      feature: "copilot_web_search",
      model: GEMINI_FREE_MODEL,
      promptTokens: estimateTokens(query),
      latencyMs: Date.now() - t0,
      status: "error",
      errorMessage: (err as Error).message,
    });
    return emptyResult("I couldn't fetch live web results right now. Please try again shortly.");
  }
}

export async function executeWebSearch(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query ?? "").trim();
  if (!query) return JSON.stringify({ error: "query is required" });
  const result = await webSearch(query);
  return JSON.stringify({
    ok: true,
    query,
    answer: result.answer,
    sources: result.sources,
    guidance:
      "Summarize the answer in 1-2 sentences with brief attribution to sources (title only). " +
      "Do not reproduce source text verbatim beyond a short phrase. Link sources when helpful.",
  });
}
