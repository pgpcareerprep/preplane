import type { SearchHit, SearchProvider } from "../types.ts";

const HOSTED_FIRECRAWL = "https://api.firecrawl.dev/v2";

/** Paid hosted Firecrawl — free: false, skipped under ZERO_SPEND. */
export function createFirecrawlSearchProvider(apiKey: string | null, selfHostUrl?: string | null): SearchProvider | null {
  const base = selfHostUrl?.trim() || (apiKey ? HOSTED_FIRECRAWL : null);
  if (!base || !apiKey) return null;
  const isSelfHosted = Boolean(selfHostUrl?.trim());
  return {
    name: isSelfHosted ? "firecrawl-self-host-search" : "firecrawl-search",
    free: isSelfHosted,
    async search(q: string, limit: number, signal?: AbortSignal): Promise<SearchHit[]> {
      const res = await fetch(`${base.replace(/\/$/, "")}/search`, {
        method: "POST",
        signal: signal ?? AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, limit }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const items: unknown[] = data?.data?.web ?? data?.data ?? data?.web ?? [];
      return (items as Record<string, unknown>[]).map((x) => ({
        url: typeof x.url === "string" ? x.url : "",
        title: typeof x.title === "string" ? x.title : "",
        description: typeof x.description === "string" ? x.description : (typeof x.snippet === "string" ? x.snippet : ""),
      })).filter((h) => h.url);
    },
  };
}

/** Stub — not wired in active chain. */
export const braveSearchProviderStub: SearchProvider = {
  name: "brave-search",
  free: false,
  async search(): Promise<SearchHit[]> {
    return [];
  },
};

export const serperSearchProviderStub: SearchProvider = {
  name: "serper-search",
  free: false,
  async search(): Promise<SearchHit[]> {
    return [];
  },
};
