import type { SearchHit, SearchProvider } from "../types.ts";
import { loadSecret } from "../secrets.ts";

async function jinaHeaders(): Promise<Record<string, string>> {
  const key = (await loadSecret("JINA_API_KEY")) ?? Deno.env.get("JINA_API_KEY")?.trim() ?? null;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/** Jina free-tier search via s.jina.ai */
export const jinaSearchProvider: SearchProvider = {
  name: "jina-search",
  free: true,
  async search(q: string, limit: number, signal?: AbortSignal): Promise<SearchHit[]> {
    const url = `https://s.jina.ai/${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(15000),
      headers: await jinaHeaders(),
    });
    if (!res.ok) return [];
    const text = await res.text();
    // Jina may return markdown or JSON depending on tier; parse flexibly.
    try {
      const data = JSON.parse(text);
      const items: unknown[] = data?.data ?? data?.results ?? data ?? [];
      if (Array.isArray(items)) {
        return items.slice(0, limit).map((x: unknown) => {
          const item = x as Record<string, unknown>;
          return {
            url: String(item.url ?? item.link ?? ""),
            title: String(item.title ?? item.name ?? ""),
            description: String(item.description ?? item.snippet ?? item.content ?? ""),
          };
        }).filter((h) => h.url);
      }
    } catch {
      /* markdown fallback below */
    }
    const hits: SearchHit[] = [];
    const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(text)) !== null && hits.length < limit) {
      hits.push({ title: m[1] ?? "", url: m[2] ?? "", description: "" });
    }
    return hits;
  },
};
