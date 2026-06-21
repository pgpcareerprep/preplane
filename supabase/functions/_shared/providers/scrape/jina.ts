import type { ScrapeProvider, ScrapeResult } from "../types.ts";
import { loadSecret } from "../secrets.ts";

/** Jina Reader free tier — r.jina.ai */
export const jinaScrapeProvider: ScrapeProvider = {
  name: "jina-reader",
  free: true,
  async scrape(url: string, signal?: AbortSignal): Promise<ScrapeResult | null> {
    const target = `https://r.jina.ai/${url.startsWith("http") ? url : `https://${url}`}`;
    const key = (await loadSecret("JINA_API_KEY")) ?? Deno.env.get("JINA_API_KEY")?.trim() ?? null;
    const headers: Record<string, string> = { Accept: "text/plain" };
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(target, {
      signal: signal ?? AbortSignal.timeout(20000),
      headers,
    });
    if (!res.ok) return null;
    const markdown = await res.text();
    if (!markdown || markdown.length < 50) return null;
    return { markdown: markdown.slice(0, 12000), json: null };
  },
};
