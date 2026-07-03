import { DEFAULT_APP_ORIGIN } from "./appConfig.ts";

const ALLOWED_ORIGINS = new Set<string>([
  DEFAULT_APP_ORIGIN,
]);

export const BASE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Vary": "Origin",
};

export function pickAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") ?? req.headers.get("Origin") ?? "";
  if (!origin) return DEFAULT_APP_ORIGIN;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1") return origin;
    if (url.protocol === "https:" && (host === "preplane.pages.dev" || host.endsWith(".preplane.pages.dev"))) {
      return origin;
    }
    const appUrl = (Deno.env.get("APP_URL") || "").trim().replace(/\/$/, "");
    if (appUrl) {
      try {
        if (origin === new URL(appUrl).origin) return origin;
      } catch { /* ignore invalid APP_URL */ }
    }
  } catch { /* fall through */ }
  return DEFAULT_APP_ORIGIN;
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    ...BASE_CORS_HEADERS,
    "Access-Control-Allow-Origin": pickAllowedOrigin(req),
  };
}
