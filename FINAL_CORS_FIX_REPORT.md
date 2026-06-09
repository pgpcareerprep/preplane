# FINAL CORS Fix Report — external-mentor-search

**Date:** 2026-06-09  
**Commit:** `89e0a79`  
**Function:** `external-mentor-search`  
**Project:** `sgqwnjajvgjcwqergnsr`

---

## Root Cause

`supabase/functions/external-mentor-search/index.ts` imported `DEFAULT_ORIGIN` from `../_shared/cors.ts`:

```ts
// BROKEN — DEFAULT_ORIGIN is never exported from cors.ts
import { buildCorsHeaders, BASE_CORS_HEADERS, DEFAULT_ORIGIN } from "../_shared/cors.ts";
```

`cors.ts` defines `DEFAULT_ORIGIN` as a private module constant (`const`, no `export`). In Deno's strict ES module runtime this is a **TypeScript link error at module initialization time** — the function worker crashes before the handler is ever registered. Every request, including `OPTIONS` preflights, received a `500 Internal Server Error`.

Browsers see a 500 for OPTIONS and report it as:
> "Response to preflight request doesn't pass access control check: It does not have HTTP ok status."

A secondary issue: the handler mutated a module-level shared `corsHeaders` object per request, which is fragile and incorrect.

---

## Exact Fix

**File changed:** `supabase/functions/external-mentor-search/index.ts`

### 1. Fixed the broken import
```ts
// BEFORE (broken):
import { buildCorsHeaders, BASE_CORS_HEADERS, DEFAULT_ORIGIN } from "../_shared/cors.ts";
const corsHeaders: Record<string, string> = { ...BASE_CORS_HEADERS, "Access-Control-Allow-Origin": DEFAULT_ORIGIN };

// AFTER (fixed):
import { buildCorsHeaders } from "../_shared/cors.ts";
```

### 2. Per-request CORS headers + OPTIONS as first check
```ts
Deno.serve(async (req) => {
  // Build CORS headers fresh for every request (origin-specific, no shared state).
  const corsH = buildCorsHeaders(req);

  console.log("[external-mentor-search] incoming:", req.method);

  // OPTIONS MUST be the very first check — before auth, before body parse, before anything.
  if (req.method === "OPTIONS") {
    console.log("[external-mentor-search] OPTIONS preflight — returning 200");
    return new Response("ok", { status: 200, headers: corsH });
  }
  ...
```

### 3. config.toml — no change needed
```toml
[functions.external-mentor-search]
verify_jwt = false
```
Already present and correct.

### 4. Deployment — used explicit `--no-verify-jwt` flag
```
supabase functions deploy external-mentor-search --no-verify-jwt --project-ref sgqwnjajvgjcwqergnsr
```
Previous deployments used only config.toml; adding the explicit flag guarantees the setting was applied.

---

## CORS Headers Verified

`buildCorsHeaders(req)` returns:

| Header | Value |
|--------|-------|
| `Access-Control-Allow-Origin` | `https://preplane.pages.dev` (origin-specific, not `*`) |
| `Access-Control-Allow-Headers` | `authorization, x-client-info, apikey, content-type, x-supabase-client-platform, ...` |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, PATCH, DELETE, OPTIONS` |
| `Vary` | `Origin` |

> Note: `Access-Control-Allow-Origin: *` cannot be used alongside `Authorization` headers. The origin-specific approach is correct for JWT-authenticated requests.

---

## curl Verification Result

### OPTIONS preflight
```
curl -si -X OPTIONS \
  -H "Origin: https://preplane.pages.dev" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, content-type" \
  https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/external-mentor-search
```

**Result: HTTP/2 200** ✅
```
access-control-allow-origin: https://preplane.pages.dev
access-control-allow-headers: authorization, x-client-info, apikey, content-type, ...
access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
```

### POST request (no auth — expected 401 with CORS headers)
```
curl -si -X POST ... (no Authorization header)
```
**Result: HTTP/2 401** with `access-control-allow-origin: https://preplane.pages.dev` ✅  
CORS headers are present on the 401, so the browser will show the 401 body to JS — not a CORS error.

---

## Deployment Status

| Step | Status |
|------|--------|
| Code fixed | ✅ committed `89e0a79` |
| Pushed to GitHub | ✅ `main` branch |
| Function deployed | ✅ `sgqwnjajvgjcwqergnsr` |
| `--no-verify-jwt` applied | ✅ explicit flag + config.toml |
| OPTIONS preflight curl | ✅ HTTP 200 |
| CORS headers on POST | ✅ present on 401 (no auth) |

---

## Logging Added

Every request now logs to Supabase function logs:

```
[external-mentor-search] incoming: OPTIONS
[external-mentor-search] OPTIONS preflight — returning 200

[external-mentor-search] incoming: POST
[external-mentor-search] auth check starting, origin: https://preplane.pages.dev
[external-mentor-search] auth passed, role: admin
[external-mentor-search] using Firecrawl pipeline   ← or: no Firecrawl — using Gemini search fallback
[external-mentor-search] done — returning 5 mentors
```
