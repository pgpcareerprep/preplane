/** Maps Copilot response headers to human-readable composer labels. */

export type CopilotPathKind = "LOCAL" | "FAST" | "QUERY" | "COMMAND" | "AGENT";

export type CopilotInferenceInput = {
  model?: string | null;
  path?: string | null;
  fallback?: boolean;
  /** True when no turn has completed yet in this session. */
  idle?: boolean;
};

function providerForModel(model: string): string {
  if (model.includes("/")) return "OpenRouter";
  if (/^gemini/i.test(model)) return "Gemini";
  if (/^grok/i.test(model)) return "xAI";
  return "AI gateway";
}

function shortLlmModel(model: string): string {
  if (model.includes("/")) {
    return model.split("/").pop()?.replace(/:free$/, "") ?? model;
  }
  return model.replace(/^gemini-/i, "").slice(0, 24) || model;
}

export function formatCopilotInferenceDisplay(input: CopilotInferenceInput = {}): {
  provider: string;
  shortModel: string;
  label: string;
  usesLlm: boolean;
} {
  const { model, path, fallback, idle } = input;
  const pathUpper = (path ?? "").toUpperCase();

  if (idle && !model) {
    return { provider: "Auto", shortModel: "ready", label: "Auto · ready", usesLlm: false };
  }

  if (pathUpper === "COMMAND" || model === "command-plane") {
    return { provider: "Command plane", shortModel: "no LLM", label: "Command plane · no LLM", usesLlm: false };
  }
  if (pathUpper === "QUERY" || model === "query-path") {
    return { provider: "Query path", shortModel: "no LLM", label: "Query path · no LLM", usesLlm: false };
  }
  if (pathUpper === "FAST" || (model === "deterministic" && pathUpper !== "LOCAL")) {
    return { provider: "Fast path", shortModel: "no LLM", label: "Fast path · no LLM", usesLlm: false };
  }
  if (pathUpper === "LOCAL" || model === "deterministic") {
    return { provider: "Local", shortModel: "no LLM", label: "Local · no LLM", usesLlm: false };
  }
  if (model === "cached") {
    return { provider: "Cache", shortModel: "replay", label: "Cache · replay", usesLlm: false };
  }

  const resolved = model?.trim() || "";
  if (!resolved) {
    return { provider: "Auto", shortModel: "ready", label: "Auto · ready", usesLlm: false };
  }

  const provider = providerForModel(resolved);
  const shortModel = shortLlmModel(resolved);
  const suffix = fallback ? " (fallback)" : "";
  const pathTag = pathUpper === "AGENT" ? "" : "";
  void pathTag;
  return {
    provider,
    shortModel,
    label: `${provider} · ${shortModel}${suffix}`,
    usesLlm: true,
  };
}

/** @deprecated Use formatCopilotInferenceDisplay — kept for existing imports. */
export function formatCopilotModelDisplay(model: string, fallback = false): {
  provider: string;
  shortModel: string;
  label: string;
} {
  const d = formatCopilotInferenceDisplay({ model, fallback });
  return { provider: d.provider, shortModel: d.shortModel, label: d.label };
}
