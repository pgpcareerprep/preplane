import type { ScrapeProvider, ScrapeResult } from "../types.ts";

function baseUrl(): string | null {
  const url = Deno.env.get("CRAWL4AI_URL")?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

export function createCrawl4aiProvider(): ScrapeProvider | null {
  const base = baseUrl();
  if (!base) return null;
  return {
    name: "crawl4ai",
    free: true,
    async scrape(url: string, signal?: AbortSignal): Promise<ScrapeResult | null> {
      const res = await fetch(`${base}/crawl`, {
        method: "POST",
        signal: signal ?? AbortSignal.timeout(25000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"] }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const markdown = data?.markdown ?? data?.data?.markdown ?? data?.result?.markdown ?? "";
      if (typeof markdown !== "string" || markdown.length < 50) return null;
      return { markdown: markdown.slice(0, 12000), json: null };
    },
  };
}
