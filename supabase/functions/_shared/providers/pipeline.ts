import { getCachedScrape, getCachedSearch, putScrape, putSearch } from "./cache.ts";
import type { Logger } from "../logger.ts";
import { runWithFallback } from "./registry.ts";
import { createSearxngProvider } from "./search/searxng.ts";
import { jinaSearchProvider } from "./search/jina.ts";
import type { SearchHit, SearchProvider, ScrapeProvider, ScrapeResult } from "./types.ts";
import { createCrawl4aiProvider } from "./scrape/crawl4ai.ts";
import { jinaScrapeProvider } from "./scrape/jina.ts";
import { extractFromMarkdown } from "./extract/gemini.ts";

export function buildSearchProviders(): SearchProvider[] {
  const providers: SearchProvider[] = [];
  const searxng = createSearxngProvider();
  if (searxng) providers.push(searxng);
  providers.push(jinaSearchProvider);
  return providers;
}

export function buildScrapeProviders(): ScrapeProvider[] {
  const providers: ScrapeProvider[] = [];
  const crawl4ai = createCrawl4aiProvider();
  if (crawl4ai) providers.push(crawl4ai);
  providers.push(jinaScrapeProvider);
  return providers;
}

export async function cachedSearch(
  query: string,
  limit: number,
  log: Logger,
): Promise<SearchHit[]> {
  const cached = await getCachedSearch(query);
  if (cached) {
    log.info("search_cache_hit", { query: query.slice(0, 80) });
    return cached;
  }
  const providers = buildSearchProviders();
  const { result, reason } = await runWithFallback(
    providers.map((p) => ({
      name: p.name,
      free: p.free,
      run: () => p.search(query, limit),
    })),
    log,
  );
  if (!result?.length) {
    log.warn("search_no_results", { query: query.slice(0, 80), reason });
    return [];
  }
  await putSearch(query, result);
  return result;
}

export async function cachedScrape(
  url: string,
  log: Logger,
  geminiKey?: string | null,
): Promise<ScrapeResult | null> {
  if (/linkedin\.com\/in\//i.test(url)) {
    log.info("scrape_skipped_linkedin", { url });
    return null;
  }
  const cached = await getCachedScrape(url);
  if (cached) {
    log.info("scrape_cache_hit", { url });
    return cached;
  }
  const providers = buildScrapeProviders();
  const { result, reason } = await runWithFallback(
    providers.map((p) => ({
      name: p.name,
      free: p.free,
      run: () => p.scrape(url),
    })),
    log,
  );
  if (!result) {
    log.warn("scrape_no_results", { url, reason });
    return null;
  }
  if (geminiKey && !result.json) {
    result.json = await extractFromMarkdown(geminiKey, result.markdown);
  }
  await putScrape(url, result);
  return result;
}
