// responseValidator.ts — per-intent structured response validation + repair.
// All intent handlers that produce JSON output should call validateResponse()
// before returning to the client. If validation fails, the repair pass asks
// the model to fix its own output. If that also fails, we return a safe text
// fallback so the UI always has something to display.

export type IntentSchema = {
  required: string[];
  // key → expected JS typeof string, or "array", or "object"
  types?: Record<string, string>;
};

// ─── Per-intent output schemas ────────────────────────────────────────────────
export const INTENT_SCHEMAS: Record<string, IntentSchema> = {
  // Simple status / greeting — no structured JSON required
  greeting:     { required: [] },
  help:         { required: [] },
  general_chat: { required: [] },
  voice_command:{ required: [] },

  // Candidate / LMP status
  get_candidate_status: {
    required: ["candidateId", "status"],
    types: { candidateId: "string", status: "string" },
  },
  get_lmp_status: {
    required: ["lmpCode", "stage"],
    types: { lmpCode: "string", stage: "string" },
  },

  // Report generation — must have title + sections
  report_generation: {
    required: ["title", "sections"],
    types: { title: "string", sections: "array" },
  },

  // Analytics
  analytics_query: {
    required: ["metric", "value"],
    types: { metric: "string" },
  },

  // Mentor/alumni matching
  mentor_matching: {
    required: ["matches"],
    types: { matches: "array" },
  },
  alumni_matching: {
    required: ["matches"],
    types: { matches: "array" },
  },

  // CV/ATS analysis output
  cv_analysis: {
    required: ["overallScore", "grade", "componentScores"],
    types: { overallScore: "number", grade: "string", componentScores: "object" },
  },

  // Pending action confirmation
  pending_action: {
    required: ["actionType", "summary"],
    types: { actionType: "string", summary: "string" },
  },
};

// ─── Validation ───────────────────────────────────────────────────────────────
export type ValidationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; errors: string[] };

export function validateStructuredResponse(
  rawText: string,
  intent: string,
): ValidationResult {
  const schema = INTENT_SCHEMAS[intent];

  // No schema = plain text intent, always valid
  if (!schema || schema.required.length === 0) {
    return { ok: true, data: { text: rawText } };
  }

  // Try to parse JSON from rawText (may be wrapped in ```json ... ```)
  let data: Record<string, unknown>;
  try {
    data = extractJson(rawText);
  } catch {
    return { ok: false, errors: [`Response is not valid JSON for intent "${intent}"`] };
  }

  const errors: string[] = [];

  for (const key of schema.required) {
    if (!(key in data) || data[key] === null || data[key] === undefined) {
      errors.push(`Missing required field: "${key}"`);
    }
  }

  if (schema.types) {
    for (const [key, expectedType] of Object.entries(schema.types)) {
      if (!(key in data)) continue; // already caught above if required
      const val = data[key];
      if (expectedType === "array" && !Array.isArray(val)) {
        errors.push(`Field "${key}" must be an array`);
      } else if (expectedType !== "array" && !Array.isArray(val) && typeof val !== expectedType) {
        errors.push(`Field "${key}" must be ${expectedType}, got ${typeof val}`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data };
}

// ─── JSON extractor — handles code-fenced responses ──────────────────────────
export function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.trim();

  // Try raw JSON first
  if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
    return JSON.parse(cleaned);
  }

  // Strip ```json ... ``` or ``` ... ``` fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1].trim());
  }

  // Last resort: find first { … }
  const braceStart = cleaned.indexOf("{");
  const braceEnd   = cleaned.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return JSON.parse(cleaned.slice(braceStart, braceEnd + 1));
  }

  throw new Error("No JSON object found in response text");
}

// ─── Repair-pass prompt builder ───────────────────────────────────────────────
export function buildRepairPrompt(
  originalOutput: string,
  errors: string[],
  intent: string,
): string {
  const schema = INTENT_SCHEMAS[intent];
  const required = schema?.required ?? [];
  return [
    `Your previous response for intent "${intent}" failed validation.`,
    `Errors: ${errors.join("; ")}`,
    `Required fields: ${required.join(", ")}`,
    ``,
    `Your previous output was:`,
    `---`,
    originalOutput.slice(0, 2000),
    `---`,
    ``,
    `Fix the output. Return ONLY valid JSON containing all required fields. No explanation, no markdown.`,
  ].join("\n");
}

// ─── Safe text fallback ───────────────────────────────────────────────────────
export function buildSafeTextFallback(
  intent: string,
  errors: string[],
): Record<string, unknown> {
  return {
    ok: false,
    intent,
    fallback: true,
    text: `I was unable to generate a properly structured response for "${intent}". Please try again.`,
    validationErrors: errors,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────
// callRepair is an optional async function that calls the model for a repair
// pass — pass it if you want repair attempts, or omit for validate-only mode.
export async function validateResponse(opts: {
  rawText: string;
  intent: string;
  callRepair?: (repairPrompt: string) => Promise<string>;
}): Promise<{ data: Record<string, unknown>; wasRepaired: boolean; wasFallback: boolean }> {
  const { rawText, intent, callRepair } = opts;

  const first = validateStructuredResponse(rawText, intent);
  if (first.ok) return { data: first.data, wasRepaired: false, wasFallback: false };

  // Attempt a repair pass if caller provides the repair function
  if (callRepair) {
    try {
      const repairPrompt = buildRepairPrompt(rawText, first.errors, intent);
      const repaired = await callRepair(repairPrompt);
      const second = validateStructuredResponse(repaired, intent);
      if (second.ok) return { data: second.data, wasRepaired: true, wasFallback: false };
      // Repair also failed — fall through to safe fallback
    } catch (e) {
      console.warn(`[responseValidator] repair pass threw: ${(e as Error).message}`);
    }
  }

  // Safe text fallback so callers never crash
  const fallback = buildSafeTextFallback(intent, first.errors);
  return { data: fallback, wasRepaired: false, wasFallback: true };
}
