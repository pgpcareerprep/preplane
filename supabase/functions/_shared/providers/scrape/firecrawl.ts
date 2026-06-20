import type { ScrapeProvider, ScrapeResult } from "../types.ts";

const HOSTED_FIRECRAWL = "https://api.firecrawl.dev/v2";

export function createFirecrawlScrapeProvider(apiKey: string | null, selfHostUrl?: string | null): ScrapeProvider | null {
  const base = selfHostUrl?.trim() || (apiKey ? HOSTED_FIRECRAWL : null);
  if (!base || !apiKey) return null;
  const isSelfHosted = Boolean(selfHostUrl?.trim());
  return {
    name: isSelfHosted ? "firecrawl-self-host-scrape" : "firecrawl-scrape",
    free: isSelfHosted,
    async scrape(url: string, signal?: AbortSignal): Promise<ScrapeResult | null> {
      const res = await fetch(`${base.replace(/\/$/, "")}/scrape`, {
        method: "POST",
        signal: signal ?? AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, onlyMainContent: true, formats: ["markdown"] }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const payload = data?.data ?? data;
      const markdown = typeof payload?.markdown === "string" ? payload.markdown : "";
      if (!markdown || markdown.length < 50) return null;
      return { markdown: markdown.slice(0, 12000), json: null };
    },
  };
}
