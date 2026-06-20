import type { SearchHit, SearchProvider } from "../types.ts";

function baseUrl(): string | null {
  const url = Deno.env.get("SEARXNG_URL")?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

export function createSearxngProvider(): SearchProvider | null {
  const base = baseUrl();
  if (!base) return null;
  return {
    name: "searxng",
    free: true,
    async search(q: string, limit: number, signal?: AbortSignal): Promise<SearchHit[]> {
      const url = `${base}/search?q=${encodeURIComponent(q)}&format=json&categories=general`;
      const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      const data = await res.json();
      const items: unknown[] = data?.results ?? [];
      return items.slice(0, limit).map((x: unknown) => {
        const item = x as Record<string, unknown>;
        return {
          url: typeof item.url === "string" ? item.url : "",
          title: typeof item.title === "string" ? item.title : "",
          description: typeof item.content === "string" ? item.content : "",
        };
      }).filter((h) => h.url);
    },
  };
}
