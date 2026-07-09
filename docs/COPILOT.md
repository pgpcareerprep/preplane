# LMP Copilot — Architecture & Acceptance Guide

The Copilot is a streaming, tool-using assistant for the LMP process workspace.
It is composed of three main surfaces:

1. **`/copilot`** — the chat UI (`src/pages/CopilotPage.tsx`).
2. **`/copilot/insights`** — observability dashboard (`src/pages/CopilotInsightsPage.tsx`).
3. **Copilot backend** — production traffic routes to the Rust gateway
   (`https://preplane-copilot.onrender.com`) by default. Legacy edge functions
   (`copilot-ai`, `voice-copilot`) remain for rollback via `VITE_COPILOT_USE_LEGACY=1`.

## Data flow (Phase 9 — hybrid gateway)

```text
User ─▶ CopilotPage ─▶ POST {gateway}/copilot (SSE)
                            │
                            ├─ intent-router (rules + classifier)
                            ├─ query-path / command-plane / reasoning / workflow
                            └─ telemetry → copilot_turns (legacy edge when applicable)
                            ▼
                       streamed blocks
                            │
                            ▼
                       BlockRenderer
```

Rollback: set `VITE_COPILOT_USE_LEGACY=1` on Cloudflare Pages to restore
`POST /functions/v1/copilot-ai`.

## Data flow (legacy edge — rollback only)

```text
User ─▶ CopilotPage ─▶ POST /functions/v1/copilot-ai (SSE)
                            │
                            ├─ tool-call loop (read / write / plan tools)
                            ├─ entity_registry resolution
                            └─ telemetry → copilot_turns
                            ▼
                       streamed blocks
                            │
                            ▼
                       BlockRenderer
```

Threads and messages persist via `useCopilotThreads` →
`copilot_threads` / `copilot_messages` (RLS-scoped per user).

## Dynamic UI blocks

The assistant emits a fenced `:::blocks … :::` JSON array. `parseBlocks`
(`src/lib/copilotBlocks.ts`) validates each entry against the allowlist and
silently drops unknown / malformed blocks so partial streams never crash the
renderer. Supported block types include: `executive-summary`, `kpi-row`,
`bar-chart`, `donut-chart`, `area-chart`, `funnel`, `table`, `status-cards`,
`timeline`, `kanban`, `heatmap`, `alert-cards`, `recommendations`,
`follow-ups`, `progress-tracker`, `text`, `inline-form`, `action-buttons`,
`confirmation-card`, `info-card`, `pipeline-card`, `activity-feed`,
`disambiguation-card`, `permission-denied-card`, `jd-summary-card`,
`mentor-shortlist-card`, `plan-card`.

## Agentic planning (Phase L) and round budget (Phase O)

For multi-step intents the LLM must call `make_plan` first and then
`update_plan_step` after each underlying tool call. The final response renders
exactly one `plan-card` so the user can see the full chain and resume if
paused.

The tool-calling loop has a budget of **14 rounds** per turn (`MAX_TOOL_ROUNDS`).
At round 12 a soft system message is injected telling the model to wrap up.
If the cap is still hit, the loop exits cleanly: a final non-tool LLM call
streams a partial summary back, plus a `follow-ups` block with a
**"Continue from where you left off"** suggestion. Identical read-tool calls
within a single turn are deduplicated by an in-memory memo keyed on
`(name, sortedArgs)` — the model can't burn rounds re-fetching the same row.

## Telemetry (Phase J / K)

Every turn writes to `copilot_turns`:
- `latency_ms`, `tools_used`, `tool_calls_count`, `used_write_tool`
- `mode`, `intent`, `status` (`ok` / `rate_limited` / `credits_exhausted` /
  `ai_gateway_error` / `max_rounds` / `error`)
- `cache_hit`

`/copilot/insights` reads the table directly with RLS — admins see org-wide
aggregates, regular users see their own slice.

Deep-links from the Recent Turns table use `?thread=<id>`; `CopilotPage`
switches the active thread on load and clears the param.

## Acceptance checklist

Run before publishing a Copilot change:

- [ ] `bunx vitest run src/lib/__tests__/copilotBlocks.test.ts` passes.
- [ ] Sending a greeting (e.g. "hi") returns a short reply with no tool
      calls and no plan card.
- [ ] Asking "show me LMP processes for Acme" renders a `table` or
      `pipeline-card` (no raw JSON visible).
- [ ] An ambiguous mention surfaces a `disambiguation-card`; selecting a
      candidate continues the turn.
- [ ] A multi-step prompt (e.g. "parse this JD, find mentors, assign the
      best one") renders a `plan-card` and step statuses progress.
- [ ] A write action ("update LMP X to On Hold") prompts a
      `confirmation-card` before mutating data.
- [ ] A non-admin user gets a `permission-denied-card` for write actions
      they cannot perform.
- [ ] Network failure / 5xx replaces the assistant bubble with a
      readable error, never an empty bubble.
- [ ] `/copilot/insights` loads, range switching refetches, and the
      empty state renders cleanly when no turns exist in the window.
- [ ] Clicking "open" on a Recent Turns row deep-links into that thread.
- [ ] No occurrence of the word "requisition" in any new copy.
- [ ] All colors come from `index.css` / `tailwind.config.ts` tokens; no
      raw hex in components.

## Extending the Copilot

When adding a new block:

1. Add the type to `src/lib/copilotBlocks.ts` (both the union and
   `VALID_BLOCK_TYPES`).
2. Add a renderer case in `src/components/copilot/BlockRenderer.tsx`.
3. Teach the system prompt in `supabase/functions/copilot-ai/index.ts`
   when to emit it.
4. Add a test case to `copilotBlocks.test.ts` covering a valid payload.

## Operator: GEMINI_API_KEY rotation

If copilot or voice returns **403 PERMISSION_DENIED** / "API key blocked" from Gemini:

1. Create a new key in [Google AI Studio](https://aistudio.google.com/apikey) (or your org's GCP console).
2. Update Supabase Edge Function secrets for project `sgqwnjajvgjcwqergnsr`:

```bash
npx supabase secrets set GEMINI_API_KEY="<new-key>" --project-ref sgqwnjajvgjcwqergnsr
```

3. If vault also stores a copy, update the `GEMINI_API_KEY` vault secret in the Supabase dashboard (Settings → Vault) so env and vault stay in sync — `copilot-ai` logs a warning when they diverge.
4. Redeploy AI functions (secrets are picked up on cold start; redeploy ensures clean rollout):

```bash
npx supabase functions deploy copilot-ai voice-copilot voice-speak create-case-study --project-ref sgqwnjajvgjcwqergnsr
```

5. Verify with a simple copilot prompt; check function logs for `ALL_AI_PROVIDERS_UNAVAILABLE` vs a clean response.
