import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { CACHE_TTL_DAYS } from "./config.ts";
import type { SearchHit } from "./types.ts";
import type { ScrapeResult } from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client && SUPABASE_URL && SERVICE_ROLE) {
    _client = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

function ttlMs(days = CACHE_TTL_DAYS): number {
  return days * 24 * 60 * 60 * 1000;
}

function isFresh(fetchedAt: string | null | undefined, days = CACHE_TTL_DAYS): boolean {
  if (!fetchedAt) return false;
  return Date.now() - new Date(fetchedAt).getTime() < ttlMs(days);
}

export function hashQuery(q: string): string {
  let h = 0;
  for (let i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export async function getCachedScrape(
  url: string,
  ttlDays = CACHE_TTL_DAYS,
): Promise<ScrapeResult | null> {
  const db = getClient();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("scraped_pages")
      .select("markdown, json, fetched_at")
      .eq("url", url)
      .maybeSingle();
    if (error || !data || !isFresh(data.fetched_at, ttlDays)) return null;
    return {
      markdown: typeof data.markdown === "string" ? data.markdown : "",
      json: (data.json as Record<string, unknown>) ?? null,
    };
  } catch {
    return null;
  }
}

export async function putScrape(url: string, data: ScrapeResult): Promise<void> {
  const db = getClient();
  if (!db) return;
  try {
    await db.from("scraped_pages").upsert({
      url,
      markdown: data.markdown ?? "",
      json: data.json,
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[cache] putScrape failed:", (e as Error).message);
  }
}

export async function getCachedSearch(
  query: string,
  ttlDays = CACHE_TTL_DAYS,
): Promise<SearchHit[] | null> {
  const db = getClient();
  if (!db) return null;
  const queryHash = hashQuery(query);
  try {
    const { data, error } = await db
      .from("search_cache")
      .select("hits, fetched_at")
      .eq("query_hash", queryHash)
      .maybeSingle();
    if (error || !data || !isFresh(data.fetched_at, ttlDays)) return null;
    const hits = data.hits;
    return Array.isArray(hits) ? (hits as SearchHit[]) : null;
  } catch {
    return null;
  }
}

export async function putSearch(query: string, hits: SearchHit[]): Promise<void> {
  const db = getClient();
  if (!db) return;
  try {
    await db.from("search_cache").upsert({
      query_hash: hashQuery(query),
      hits,
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[cache] putSearch failed:", (e as Error).message);
  }
}
