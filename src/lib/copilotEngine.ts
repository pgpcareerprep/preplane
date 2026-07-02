/**
 * LMP Copilot configuration.
 *
 * The actual AI logic runs server-side in the copilot-ai edge function
 * with full tool-calling capabilities. This file provides client-side
 * constants (modes, quick prompts) and a small batching layer so multiple
 * dashboard panels can ask the copilot at once without spawning N requests.
 */
import { supabase } from "@/integrations/supabase/client";

export type CopilotMode =
  | "auto" | "ask" | "summarize" | "update" | "assign" | "analyze" | "search";

// Note: the legacy `PreviewKind` / `PreviewPayload` types and the
// `CopilotPreviewDrawer` they fed were removed — that drawer rendered
// hardcoded demo data and was no longer mounted by any page.



export { QUICK_PROMPTS } from "@/lib/config/copilotPrompts";

// ─── Batched, deduplicated copilot queries ────────────────────────────
// When several panels mount together (e.g. dashboard load) they can each call
// `askCopilot()` and we'll collapse them into one model call with a numbered
// multi-question prompt, splitting the answer back to each caller.
//
// Calls with different `lmpId` or `mode` are sent in parallel rather than
// merged (they can't legitimately share a system prompt or tool scope).

const BATCH_WINDOW_MS = 500;

type CopilotRequest = {
  prompt: string;
  mode: CopilotMode;
  lmpId?: string;
  snapshot?: string;
  resolve: (text: string) => void;
  reject: (err: unknown) => void;
};

let queue: CopilotRequest[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export interface AskCopilotInput {
  prompt: string;
  mode?: CopilotMode;
  lmpId?: string;
  /** Stable snapshot fingerprint (e.g. `${rowCount}-${lastSyncedAt}`) — used for cache keying server-side. */
  snapshot?: string;
}

/** Queue a copilot question. Resolves with the assembled assistant text. */
export function askCopilot(input: AskCopilotInput): Promise<string> {
  return new Promise((resolve, reject) => {
    queue.push({
      prompt: input.prompt,
      mode: input.mode ?? "auto",
      lmpId: input.lmpId,
      snapshot: input.snapshot,
      resolve,
      reject,
    });
    if (!timer) {
      timer = setTimeout(() => {
        const batch = queue;
        queue = [];
        timer = null;
        void flushBatch(batch);
      }, BATCH_WINDOW_MS);
    }
  });
}

async function flushBatch(batch: CopilotRequest[]): Promise<void> {
  if (batch.length === 0) return;

  // Group by (mode, lmpId) — only requests sharing both can be merged.
  const groups = new Map<string, CopilotRequest[]>();
  for (const r of batch) {
    const key = `${r.mode}::${r.lmpId ?? ""}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  await Promise.all(
    Array.from(groups.values()).map((group) =>
      group.length === 1 ? sendSingle(group[0]) : sendMerged(group),
    ),
  );
}

async function sendSingle(req: CopilotRequest): Promise<void> {
  try {
    const text = await invokeCopilot([{ role: "user", content: req.prompt }], {
      mode: req.mode,
      lmpId: req.lmpId,
      snapshot: req.snapshot,
    });
    req.resolve(text);
  } catch (err) {
    req.reject(err);
  }
}

async function sendMerged(group: CopilotRequest[]): Promise<void> {
  const numbered = group
    .map((r, i) => `Q${i + 1}: ${r.prompt}`)
    .join("\n\n");
  const wrapped =
    `Answer each of the following questions independently. ` +
    `Prefix each answer with the matching tag on its own line: [A1], [A2], ... ` +
    `in the same order as the questions.\n\n${numbered}`;

  try {
    const text = await invokeCopilot([{ role: "user", content: wrapped }], {
      mode: group[0].mode,
      lmpId: group[0].lmpId,
      snapshot: group[0].snapshot,
    });

    const parts = splitNumberedAnswers(text, group.length);
    if (!parts) {
      // Parsing failed — give every caller the full text as a safe fallback.
      for (const r of group) r.resolve(text);
      return;
    }
    group.forEach((r, i) => r.resolve(parts[i] ?? text));
  } catch (err) {
    for (const r of group) r.reject(err);
  }
}

/** Split `[A1] ... [A2] ... [A3] ...` into ordered chunks. */
function splitNumberedAnswers(text: string, expected: number): string[] | null {
  const re = /\[A(\d+)\]/g;
  const matches: { idx: number; pos: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({ idx: parseInt(m[1], 10) - 1, pos: m.index + m[0].length });
  }
  if (matches.length < expected) return null;
  const out: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].pos;
    const end = i + 1 < matches.length ? matches[i + 1].pos - `[A${matches[i + 1].idx + 1}]`.length : text.length;
    out[matches[i].idx] = text.slice(start, end).trim();
  }
  return out;
}

async function invokeCopilot(
  messages: { role: string; content: string }[],
  opts: { mode: CopilotMode; lmpId?: string; snapshot?: string },
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("copilot-ai", {
    body: {
      messages,
      mode: opts.mode,
      lmpId: opts.lmpId,
      snapshot: opts.snapshot,
    },
  });
  if (error) throw new Error(error.message);

  // The edge function returns SSE. supabase-js will hand us back the raw body
  // as a string when the content-type is text/event-stream.
  if (typeof data === "string") return assembleFromSse(data);
  if (data && typeof (data as { text?: string }).text === "string") return (data as { text: string }).text;
  return JSON.stringify(data ?? "");
}

function assembleFromSse(raw: string): string {
  let out = "";
  for (const block of raw.split("\n\n")) {
    const line = block.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const json = JSON.parse(data);
      const delta = json?.choices?.[0]?.delta?.content;
      if (typeof delta === "string") out += delta;
    } catch {
      /* skip non-JSON chunks */
    }
  }
  return out;
}

export type CopilotPendingContext = {
  pending_action_id: string;
  role?: string;
  userName?: string;
  userEmail?: string;
  realRole?: string;
  viewAsUserName?: string | null;
  viewAsRole?: string | null;
  threadId?: string | null;
};

/** Deterministic confirm/cancel — bypasses the LLM tool loop on the server. */
export async function invokeCopilotPendingAction(
  kind: "confirm" | "cancel",
  ctx: CopilotPendingContext,
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-ai`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({
      messages: [{
        role: "user",
        content: kind === "confirm"
          ? `[Confirm pending action ${ctx.pending_action_id}]`
          : `[Cancel pending action ${ctx.pending_action_id}]`,
      }],
      confirm_action: kind === "confirm",
      cancel_action: kind === "cancel",
      pending_action_id: ctx.pending_action_id,
      role: ctx.viewAsRole ?? ctx.role,
      userName: ctx.userName,
      userEmail: ctx.userEmail,
      realRole: ctx.realRole,
      viewAsUserName: ctx.viewAsUserName ?? null,
      viewAsRole: ctx.viewAsRole ?? null,
      threadId: ctx.threadId ?? null,
      cache: false,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `Error ${resp.status}` }));
    throw new Error(err.error || err.message || `Error ${resp.status}`);
  }

  const raw = await resp.text();
  return assembleFromSse(raw);
}
