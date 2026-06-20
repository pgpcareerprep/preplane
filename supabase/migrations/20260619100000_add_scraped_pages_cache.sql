-- Cache layer for external mentor search/scrape (service-role only).

CREATE TABLE IF NOT EXISTS public.scraped_pages (
  url text PRIMARY KEY,
  markdown text NOT NULL DEFAULT '',
  json jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.search_cache (
  query_hash text PRIMARY KEY,
  hits jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scraped_pages_fetched_at_idx ON public.scraped_pages (fetched_at);
CREATE INDEX IF NOT EXISTS search_cache_fetched_at_idx ON public.search_cache (fetched_at);

ALTER TABLE public.scraped_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.scraped_pages TO service_role;
GRANT ALL ON public.search_cache TO service_role;
