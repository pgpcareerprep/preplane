import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const ANALYTICAL_TTL = 300;
export const ACTION_TTL = 60;
const WRITE_TOOL_PREFIXES = ["update_", "assign_", "create_", "delete_", "remove_", "set_", "prepare_", "execute_"];

export function isWriteTool(name: string): boolean {
  if (name === "make_plan" || name === "update_plan_step") return false;
  return WRITE_TOOL_PREFIXES.some((p) => name.startsWith(p));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildCacheKey(
  messages: { role: string; content?: string }[],
  mode: string,
  lmpId: string | undefined,
  snapshot: string | undefined,
): Promise<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const payload = JSON.stringify({
    q: (lastUser?.content || "").trim(),
    mode,
    lmpId: lmpId || "",
    snapshot: snapshot || "",
  });
  return await sha256Hex(payload);
}

export function getCacheClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function readCache(key: string): Promise<{ text: string } | null> {
  try {
    const sb = getCacheClient();
    const { data, error } = await sb
      .from("copilot_cache")
      .select("response, created_at, ttl_seconds")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;
    const ageSec = (Date.now() - new Date(data.created_at).getTime()) / 1000;
    if (ageSec > (data.ttl_seconds ?? ANALYTICAL_TTL)) {
      void sb.from("copilot_cache").delete().eq("cache_key", key);
      return null;
    }
    const resp = data.response as { text?: string } | null;
    if (!resp?.text) return null;
    return { text: resp.text };
  } catch (err) {
    console.warn("cache read error", err);
    return null;
  }
}

export async function writeCache(key: string, text: string, ttl: number): Promise<void> {
  try {
    const sb = getCacheClient();
    await sb.from("copilot_cache").upsert({
      cache_key: key,
      response: { text },
      created_at: new Date().toISOString(),
      ttl_seconds: ttl,
    });
  } catch (err) {
    console.warn("cache write error", err);
  }
}

export function replayCachedSse(text: string, corsHeaders: Record<string, string>): Response {
  const sseBody =
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }], cached: true })}\n\n` +
    `data: [DONE]\n\n`;
  return new Response(sseBody, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "X-Copilot-Cache": "hit",
    },
  });
}

export function teeSseForCache(
  upstream: ReadableStream<Uint8Array>,
  onComplete: (fullText: string) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            for (const line of part.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (typeof delta === "string") assembled += delta;
              } catch { /* partial chunk */ }
            }
          }
        }
        controller.close();
        onComplete(assembled);
      } catch (e) {
        controller.error(e);
      }
    },
  });
}
