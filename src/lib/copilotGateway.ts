/**
 * Copilot gateway URL resolution.
 * When VITE_COPILOT_GATEWAY_URL is set, traffic routes to the Rust gateway.
 * When unset, the legacy Supabase edge functions are used (instant rollback).
 */
function gatewayBase(): string | null {
  const raw = import.meta.env.VITE_COPILOT_GATEWAY_URL;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim().replace(/\/$/, "");
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
