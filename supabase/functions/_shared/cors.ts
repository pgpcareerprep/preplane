// Shared CORS helpers for Lovable Cloud edge functions.
//
// Replaces the wildcard `Access-Control-Allow-Origin: *` with an allowlist
// of origins this app actually runs on. If the incoming request's Origin
// matches the allowlist (or a *.lovable.app preview host) we echo it back,
// otherwise we fall back to the canonical production origin.

const ALLOWED_ORIGINS = new Set<string>([
  "https://lmpmagic.lovable.app",
  "https://preplane.netlify.app",
]);

const DEFAULT_ORIGIN = "https://lmpmagic.lovable.app";

export const BASE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Vary": "Origin",
};

export function pickAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") ?? req.headers.get("Origin") ?? "";
  if (!origin) return DEFAULT_ORIGIN;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  try {
    const host = new URL(origin).hostname;
    if (
      host === "lovable.app" ||
      host.endsWith(".lovable.app") ||
      host === "lovableproject.com" ||
      host.endsWith(".lovableproject.com") ||
      host === "lovable.dev" ||
      host.endsWith(".lovable.dev") ||
      host === "localhost" ||
      host === "127.0.0.1"
    ) {
      return origin;
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_ORIGIN;
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    ...BASE_CORS_HEADERS,
    "Access-Control-Allow-Origin": pickAllowedOrigin(req),
  };
}
