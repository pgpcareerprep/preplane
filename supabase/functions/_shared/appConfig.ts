export const DEFAULT_APP_ORIGIN = "https://preplane.pages.dev";
export const DEFAULT_BRAND_NAME = "PrepLane";

export function getAppOrigin(): string {
  return (Deno.env.get("APP_URL") || DEFAULT_APP_ORIGIN).replace(/\/$/, "");
}

export function getBrandName(): string {
  return Deno.env.get("BRAND_NAME") || DEFAULT_BRAND_NAME;
}

export function getAiGatewayUrl(): string {
  return Deno.env.get("AI_GATEWAY_URL")
    || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
}

export function getLmpAppUrl(lmpId?: string | null): string {
  const base = `${getAppOrigin()}/lmp`;
  return lmpId ? `${base}/${encodeURIComponent(lmpId)}?tab=Overview` : base;
}
