/** Canonical production origin — all OAuth callbacks use this host. */
export const PRODUCTION_APP_ORIGIN = "https://preplane.pages.dev";

/** App origin for auth redirects. Local dev uses localhost; prod always uses pages.dev. */
export function getAppOrigin(): string {
  const configured = import.meta.env.VITE_APP_ORIGIN?.trim().replace(/\/$/, "");
  if (configured) return configured;

  if (
    import.meta.env.DEV &&
    import.meta.env.MODE !== "test" &&
    typeof window !== "undefined"
  ) {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return window.location.origin;
    }
  }

  return PRODUCTION_APP_ORIGIN;
}

/** OAuth callback URL on the canonical app host (includes optional post-login redirect path). */
export function buildLoginRedirectUrl(redirectPath?: string): string {
  const base = `${getAppOrigin()}/login`;
  if (!redirectPath || redirectPath === "/dashboard") return base;
  return `${base}?redirect=${encodeURIComponent(redirectPath)}`;
}

/** Send users on non-canonical hosts (e.g. old Netlify URLs) to the production app. */
export function redirectToCanonicalOriginIfNeeded(): void {
  if (import.meta.env.DEV || typeof window === "undefined") return;
  const canonical = PRODUCTION_APP_ORIGIN;
  if (window.location.origin === canonical) return;
  window.location.replace(
    canonical + window.location.pathname + window.location.search + window.location.hash,
  );
}
