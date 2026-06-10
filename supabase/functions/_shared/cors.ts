import { DEFAULT_APP_ORIGIN } from "./appConfig.ts";

const ALLOWED_ORIGINS = new Set<string>([
  "https://preplane.netlify.app",
  "https://heroic-nougat-e7d667.netlify.app",
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
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return origin;
  } catch { /* fall through */ }
  return DEFAULT_APP_ORIGIN;
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    ...BASE_CORS_HEADERS,
    "Access-Control-Allow-Origin": pickAllowedOrigin(req),
  };
}
