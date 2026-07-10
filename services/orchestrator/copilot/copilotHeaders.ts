/** Consistent SSE response headers for Copilot path / model telemetry. */

export type CopilotPath = "LOCAL" | "FAST" | "QUERY" | "COMMAND" | "AGENT";

export const MODEL_DETERMINISTIC = "deterministic";
export const MODEL_QUERY_PATH = "query-path";
export const MODEL_COMMAND_PLANE = "command-plane";
export const MODEL_CACHED = "cached";

export function copilotSseHeaders(
  cors: Record<string, string>,
  opts: {
    intent: string;
    path: CopilotPath;
    model: string;
    extra?: Record<string, string>;
  },
): Record<string, string> {
  return {
    ...cors,
    "Content-Type": "text/event-stream",
    "X-Copilot-Intent": opts.intent,
    "X-Copilot-Model": opts.model,
    "X-Copilot-Path": opts.path,
    ...opts.extra,
  };
}
