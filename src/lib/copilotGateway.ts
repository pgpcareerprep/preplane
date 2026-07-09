/**
 * Copilot gateway URL resolution (Phase 9b — orchestrator behind gateway).
 *
 * Production builds default to the Render gateway. Override with
 * `VITE_COPILOT_GATEWAY_URL` for local gateway development.
 */
export const PRODUCTION_COPILOT_GATEWAY_URL = "https://preplane-copilot.onrender.com";

function gatewayBase(): string | null {
  const raw = import.meta.env.VITE_COPILOT_GATEWAY_URL;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().replace(/\/$/, "");
  }
  if (import.meta.env.PROD) {
    return PRODUCTION_COPILOT_GATEWAY_URL;
  }
  return null;
}

/** Web copilot chat. */
export function copilotChatUrl(): string {
  const gw = gatewayBase();
  if (gw) return `${gw}/copilot`;
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-ai`;
}

/** Pending confirm/cancel — gateway exposes /copilot/pending. */
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
