import { AsyncLocalStorage } from "node:async_hooks";
import {
  GEMINI_TOOL_MODEL,
  GEMINI_TOOL_FALLBACK_MODELS,
} from "./modelConfig.ts";
import { createLogger, type Logger } from "../_shared/logger.ts";
import { GEMINI_DIRECT_URL } from "./constants.ts";
import type { ProviderConfig } from "./types.ts";

// ── Request-scoped data context ──
export type LmpFetch = { headers: string[]; records: Record<string, string>[]; allRows: string[][] };
export type ReqCache = {
  lmp?: Promise<LmpFetch>;
  master?: Promise<Record<string, string>[]>;
};

// Request-scoped context shared with executeTool (role for RBAC, etc.)
export type PlanStepInternal = {
  id: string; title: string; detail?: string; tool?: string;
  depends_on?: string[]; status: "pending" | "in_progress" | "done" | "failed" | "skipped";
  result_summary?: string;
};
export type PlanInternal = { plan_id: string; goal: string; steps: PlanStepInternal[]; started_at: string };
export type RequestContext = {
  role: string;
  userId: string | null;
  actorName: string | null;
  plan: PlanInternal | null;
  pocId: string | null;
  isImpersonating: boolean;
  viewAsName: string | null;
  intent: string;
  activeProviderName: string | null;
  authToken: string | null;
};

export type AiProviderState = {
  gatewayUrl: string;
  toolModel: string;
  toolFallbackModels: string[];
  extraHeaders: Record<string, string>;
  keyForChat: string;
  providers: ProviderConfig[];
};

export type CopilotRequestState = {
  cache: ReqCache;
  context: RequestContext;
  log: Logger;
  ai: AiProviderState;
};

const requestStateStorage = new AsyncLocalStorage<CopilotRequestState>();

export { requestStateStorage };

export function createRequestState(req: Request): CopilotRequestState {
  return {
    cache: {},
    context: {
      role: "poc", userId: null, actorName: null, plan: null, pocId: null,
      isImpersonating: false, viewAsName: null, intent: "unknown", activeProviderName: null,
      authToken: null,
    },
    log: createLogger("copilot-ai", req),
    ai: {
      gatewayUrl: GEMINI_DIRECT_URL,
      toolModel: GEMINI_TOOL_MODEL,
      toolFallbackModels: [...GEMINI_TOOL_FALLBACK_MODELS],
      extraHeaders: {},
      keyForChat: "",
      providers: [],
    },
  };
}

export function requestState(): CopilotRequestState {
  const state = requestStateStorage.getStore();
  if (!state) throw new Error("Copilot request context is unavailable");
  return state;
}

export function aiProvider(): AiProviderState {
  return requestState().ai;
}

export function resetRequestCache() {
  requestState().cache = {};
}

export function privilegedCopilotRole(role: string): boolean {
  return role === "admin" || role === "allocator";
}

export function viewAsBlocksWrites(): boolean {
  return !!requestState().context.isImpersonating;
}

// Per-LMP ownership check. POCs must be assigned on the LMP (prep/support via
// lmp_poc_links or denormalized columns). Admin/allocator bypass.
