import {
  GEMINI_TOOL_MODEL,
  GEMINI_TOOL_FALLBACK_MODELS,
  GEMINI_SYNTHESIS_MODELS,
  OPENROUTER_TOOL_MODEL,
  OPENROUTER_SYNTHESIS_MODELS,
  GROK_TOOL_MODEL,
  GROK_SYNTHESIS_MODELS,
} from "./modelConfig.ts";
import { isCircuitOpen, recordSuccess, recordFailure } from "../_shared/circuitBreaker.ts";
import { getAppOrigin } from "../_shared/appConfig.ts";
import { requestState, aiProvider } from "./requestContext.ts";
import { GEMINI_DIRECT_URL, OPENROUTER_URL, GROK_URL } from "./constants.ts";
import type { ProviderConfig } from "./types.ts";

export type { ProviderConfig };

const CIRCUIT_SKIP_MSG = "circuit open (recent failures — retries in ≤5 min)";

/** Sanitize upstream error text before logging or returning to clients. */
export function sanitizeFailMsg(raw: string): string {
  return raw
    .replace(/([?&]key=)[^&\s"']+/gi, "$1***")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***")
    .slice(0, 200);
}

function recordProvFailure(
  failures: Map<string, string>,
  provName: string,
  msg: string,
): string {
  const clean = sanitizeFailMsg(msg);
  if (!failures.has(provName)) failures.set(provName, clean);
  return clean;
}

function throwProviderExhaustion(
  failures: Map<string, string>,
  lastFailMsg: string,
): never {
  const parts = [...failures].map(([p, m]) => `${p}: ${m}`).join(" | ");
  const summary = parts || lastFailMsg;
  console.error(`[ai-gateway] exhausted all providers: ${summary}`);
  throw new Error(`AI gateway unavailable. Provider errors — ${summary}`);
}

// Ordered list of ALL available providers for this request.
// callSynthesis and callToolModel walk this list in order with cross-provider fallback.

export function buildProviderList(
  geminiKey: string | undefined,
  openrouterKey: string | undefined,
  grokKey: string | undefined,
): ProviderConfig[] {
  const list: ProviderConfig[] = [];
  if (geminiKey) list.push({
    name: "Gemini", url: GEMINI_DIRECT_URL, key: geminiKey,
    toolModel: GEMINI_TOOL_MODEL, toolFallbacks: GEMINI_TOOL_FALLBACK_MODELS,
    synthesisModels: GEMINI_SYNTHESIS_MODELS, extraHeaders: {},
  });
  if (openrouterKey) list.push({
    name: "OpenRouter", url: OPENROUTER_URL, key: openrouterKey,
    toolModel: OPENROUTER_TOOL_MODEL, toolFallbacks: OPENROUTER_SYNTHESIS_MODELS,
    synthesisModels: OPENROUTER_SYNTHESIS_MODELS,
    extraHeaders: { "HTTP-Referer": getAppOrigin(), "X-Title": "Preplane LMP Copilot" },
  });
  if (grokKey) list.push({
    name: "Grok", url: GROK_URL, key: grokKey,
    toolModel: GROK_TOOL_MODEL, toolFallbacks: GROK_SYNTHESIS_MODELS,
    synthesisModels: GROK_SYNTHESIS_MODELS, extraHeaders: {},
  });
  return list;
}

// Retryable HTTP status codes — advance to next model/provider on these
const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Try synthesis across all configured providers in priority order.
 * Gemini → OpenRouter → Grok. Each provider's models are tried in sequence.
 * Returns the first successful Response.
 */
export async function callSynthesis(
  _legacyKey: string, // kept for call-site compat
  body: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<{ resp: Response; model: string }> {
  const providers = requestState().ai.providers;
  if (!providers.length) throw new Error("No AI provider configured. Set GEMINI_API_KEY, OPENROUTER_API_KEY, or GROK_API_KEY in Edge Function secrets.");

  const failures = new Map<string, string>();
  let lastFailMsg = "all providers unavailable";

  for (const prov of providers) {
    if (isCircuitOpen(prov.name)) {
      if (!failures.has(prov.name)) failures.set(prov.name, CIRCUIT_SKIP_MSG);
      console.warn(`[synthesis] ${prov.name} circuit open — skipping to next provider`);
      continue;
    }

    for (const model of prov.synthesisModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        let resp: Response;
        try {
          resp = await fetch(prov.url, {
            method: "POST",
            headers: { Authorization: `Bearer ${prov.key}`, "Content-Type": "application/json", ...prov.extraHeaders },
            signal: AbortSignal.timeout(timeoutMs),
            body: JSON.stringify({ ...body, model }),
          });
        } catch (e) {
          const n = (e as { name?: string })?.name ?? "";
          const msg = `${model}: ${n === "TimeoutError" || n === "AbortError" ? "timeout" : (e as Error).message}`;
          lastFailMsg = recordProvFailure(failures, prov.name, msg);
          console.warn(`[synthesis] ${prov.name}/${lastFailMsg}`);
          recordFailure(prov.name);
          break; // network/timeout → try next model in same provider
        }

        if (resp.ok) {
          recordSuccess(prov.name);
          return { resp, model };
        }

        const errBody = await resp.text().catch(() => "");
        const msg = `${model} HTTP ${resp.status}: ${errBody.slice(0, 300)}`;
        lastFailMsg = recordProvFailure(failures, prov.name, msg);
        console.warn(`[synthesis] ${prov.name}/${lastFailMsg}`);

        if (RETRYABLE_HTTP.has(resp.status)) {
          recordFailure(prov.name);
          if (resp.status === 429 && attempt === 0) {
            console.warn(`[synthesis] ${prov.name}/${model} 429 — waiting 2s then retrying`);
            await new Promise((r) => setTimeout(r, 2000));
            continue; // one retry for 429
          }
          break; // other retryable → try next model
        }
        // Non-retryable (401, 400, etc.) — skip remaining models for this provider
        break;
      }
    }
  }

  throwProviderExhaustion(failures, lastFailMsg);
}

/**
 * Call the tool-capable model with cross-provider fallback.
 * Used in the main tool-calling loop. Returns the raw fetch Response.
 */
export async function callToolModel(
  body: Record<string, unknown>,
  timeoutMs = 25_000,
): Promise<{ resp: Response; model: string; provider: string }> {
  const providers = requestState().ai.providers;
  if (!providers.length) throw new Error("No AI provider configured.");

  const failures = new Map<string, string>();
  let lastFailMsg = "all providers unavailable";

  for (const prov of providers) {
    if (isCircuitOpen(prov.name)) {
      if (!failures.has(prov.name)) failures.set(prov.name, CIRCUIT_SKIP_MSG);
      console.warn(`[tool-model] ${prov.name} circuit open — skipping`);
      continue;
    }

    const modelsToTry = [prov.toolModel, ...prov.toolFallbacks.filter(m => m !== prov.toolModel)];

    for (const model of modelsToTry) {
      let resp: Response;
      try {
        resp = await fetch(prov.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${prov.key}`, "Content-Type": "application/json", ...prov.extraHeaders },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({ ...body, model }),
        });
      } catch (e) {
        const n = (e as { name?: string })?.name ?? "";
        const msg = `${model}: ${n === "TimeoutError" || n === "AbortError" ? "timeout" : (e as Error).message}`;
        lastFailMsg = recordProvFailure(failures, prov.name, msg);
        console.warn(`[tool-model] ${prov.name}/${lastFailMsg}`);
        recordFailure(prov.name);
        break;
      }

      if (resp.ok) {
        recordSuccess(prov.name);
        const ai = requestState().ai;
        ai.gatewayUrl = prov.url;
        ai.keyForChat = prov.key;
        ai.extraHeaders = prov.extraHeaders;
        ai.toolModel = model;
        return { resp, model, provider: prov.name };
      }

      const status = resp.status;
      const errBody = await resp.text().catch(() => "");
      const msg = `${model} HTTP ${status}: ${errBody.slice(0, 300)}`;
      lastFailMsg = recordProvFailure(failures, prov.name, msg);
      console.warn(`[tool-model] ${prov.name}/${lastFailMsg}`);

      if (RETRYABLE_HTTP.has(status)) {
        recordFailure(prov.name);
        if (status === 429) {
          await new Promise(r => setTimeout(r, 3000));
        }
        // continue to next model in same provider
      } else if (status === 401 || status === 403) {
        // Auth failure — don't try more models for this provider, try next provider
        console.warn(`[tool-model] ${prov.name} auth failure (${status}) — trying next provider`);
        break;
      } else {
        break; // non-retryable
      }
    }
  }

  throwProviderExhaustion(failures, lastFailMsg);
}
