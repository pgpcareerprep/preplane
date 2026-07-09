/**
 * Copilot gateway URL resolution (Phase 9 cutover).
 *
 * Production builds default to the Render gateway. Set `VITE_COPILOT_USE_LEGACY=1`
 * to roll back to Supabase edge functions (`copilot-ai`, `voice-copilot`).
 */
export const PRODUCTION_COPILOT_GATEWAY_URL = "https://preplane-copilot.onrender.com";

function gatewayBase(): string | null {
  const useLegacy = import.meta.env.VITE_COPILOT_USE_LEGACY;
  if (useLegacy === "1" || useLegacy === "true") {
    return null;
  }
  const raw = import.meta.env.VITE_COPILOT_GATEWAY_URL;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().replace(/\/$/, "");
  }
  if (import.meta.env.PROD) {
    return PRODUCTION_COPILOT_GATEWAY_URL;
  }
  return null;
}

/** Web copilot chat + pending-action (same path as legacy copilot-ai). */
export function copilotChatUrl(): string {
  const gw = gatewayBase();
  if (gw) return `${gw}/copilot`;
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-ai`;
}

/** Alias for pending confirm/cancel — gateway exposes /copilot/pending; legacy uses /copilot. */
export function copilotPendingUrl(): string {
  const gw = gatewayBase();
  if (gw) return `${gw}/copilot/pending`;
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-ai`;
}

export function voiceCopilotUrl(): string {
  const gw = gatewayBase();
  if (gw) return `${gw}/voice`;
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-copilot`;
}

export function voiceSpeakUrl(): string {
  const gw = gatewayBase();
  if (gw) return `${gw}/voice/speak`;
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-speak`;
}

export function isCopilotGatewayEnabled(): boolean {
  return gatewayBase() !== null;
}
