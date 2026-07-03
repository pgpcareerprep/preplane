// Sheet-write retry sweeper — drains sheet_write_queue by replaying
// queued ops against the sheets-lmp function.
//
// Runs on cron every 2 minutes. Processes up to 20 rows per invocation.
// Respects per-tab cooldown (rate_limited_until in sheets_sync_log).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireInternalSecret } from "../_shared/requireAuth.ts";

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
const THROTTLE_MS = 2500; // 2.5s between writes ≈ 24/min

function backoffSeconds(attempts: number): number {
  // 30s, 60s, 120s, 240s, 480s
  return Math.min(30 * Math.pow(2, Math.max(0, attempts - 1)), 600);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const auth = await requireInternalSecret(req, corsHeaders);
  if ("error" in auth) return auth.error;
  let requestedQueueId = "";
  try {
    const requestBody = await req.json();
    requestedQueueId = String(requestBody?.queue_id ?? "").trim();
  } catch {
    // Cron/manual sweeps may omit a JSON body.
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: "Sheet worker secrets are not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  let internalSyncSecret = Deno.env.get("INTERNAL_SYNC_SECRET")?.trim() || "";
  if (!internalSyncSecret) {
    const { data: internalAuth } = await sb
      .from("_internal_cron_auth")
      .select("token")
      .limit(1)
      .maybeSingle();
    internalSyncSecret = internalAuth?.token?.trim() || "";
  }
  if (!internalSyncSecret) {
    return new Response(JSON.stringify({ error: "INTERNAL_SYNC_SECRET is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Pull a batch of pending entries due for retry.
  let queueQuery = sb
    .from("sheet_write_queue")
    .select("*")
    .eq("status", "pending")
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true });
  if (requestedQueueId) queueQuery = queueQuery.eq("id", requestedQueueId);
  const { data: rows, error } = await queueQuery.limit(requestedQueueId ? 1 : BATCH_SIZE);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, message: "no pending writes" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch active cooldowns once.
  const tabs = Array.from(new Set(rows.map((r) => r.tab_name)));
  const { data: cooldowns } = await sb
    .from("sheets_sync_log")
    .select("tab_name, rate_limited_until")
    .in("tab_name", tabs);
  const cooldownMap = new Map<string, number>();
  (cooldowns || []).forEach((c) => {
    if (c.rate_limited_until) {
      cooldownMap.set(c.tab_name, new Date(c.rate_limited_until).getTime());
    }
  });

  const results: { id: string; status: string; error?: string }[] = [];

  for (const row of rows) {
    const lmpCode = String(row.payload?.lmp_code ?? row.payload?.findBy?.["LMP ID"] ?? "");
    console.log("[sheet-queue] processing", {
      queue_id: row.id,
      operation: row.operation,
      lmp_code: lmpCode,
      attempt: row.attempts + 1,
    });

    // A full reconcile rewrites the entire LMP Tracker. Never start it while a
    // targeted LMP write is processing; defer it so immediate create/update
    // jobs finish first and the final reconcile order remains deterministic.
    if (row.operation === "lmp-reconcile" && row.tab_name === "LMP Tracker") {
      const { count: activeTargetedWrites } = await sb
        .from("sheet_write_queue")
        .select("id", { count: "exact", head: true })
        .eq("tab_name", "LMP Tracker")
        .eq("status", "processing")
        .neq("operation", "lmp-reconcile");
      if ((activeTargetedWrites ?? 0) > 0) {
        await sb.from("sheet_write_queue")
          .update({ next_retry_at: new Date(Date.now() + 10_000).toISOString() })
          .eq("id", row.id)
          .eq("status", "pending");
        results.push({ id: row.id, status: "reconcile_deferred" });
        continue;
      }
    }
    // If tab is still cooling down, push next_retry_at out and continue.
    const cool = cooldownMap.get(row.tab_name) ?? 0;
    if (cool > Date.now()) {
      await sb.from("sheet_write_queue")
        .update({ next_retry_at: new Date(cool + 1000).toISOString() })
        .eq("id", row.id);
      results.push({ id: row.id, status: "cooldown_skipped" });
      continue;
    }

    // Mark processing.
    const { data: claimedRows } = await sb.from("sheet_write_queue")
      .update({ status: "processing", attempts: row.attempts + 1, attempt_count: (row.attempt_count ?? 0) + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (!claimedRows?.length) {
      results.push({ id: row.id, status: "already_claimed" });
      continue;
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sheets-lmp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "x-internal-secret": internalSyncSecret,
          "x-sheet-sweeper": "1",
        },
        body: JSON.stringify(row.payload),
      });
      const text = await res.text();
      let body: any = {};
      try { body = JSON.parse(text); } catch { /* ignore */ }

      // Rate limit ONLY when explicitly signalled.
      const rateLimited = res.status === 429 || body?.code === "SHEETS_RATE_LIMITED";
      const rowAlreadyGone = body?.notFound === true || body?.deleted === true;
      // `skipped: true` is a benign no-op (row_not_found / ambiguous_company_role /
      // queued no-op). Treat as success, not as failure or rate-limit.
      const benignSkip = body?.skipped === true && !rateLimited;
      const explicitError = body && (body.ok === false || (typeof body.error === "string" && body.error.length > 0));
      const targetedLmpSync = row.tab_name === "LMP Tracker" && row.operation === "sync-db-to-sheet";
      const validRowNumber = Number.isFinite(Number(body?.rowNumber)) && Number(body?.rowNumber) >= 15;
      const pipelineVerified = body?.pipelineVerified === true || body?.pipelineVerification?.ok === true;
      const missingPipelineProof = targetedLmpSync && !benignSkip && !rowAlreadyGone && (
        body?.sheetRowFound !== true ||
        !validRowNumber ||
        !pipelineVerified
      );

      if (res.ok && !rateLimited && !explicitError && !missingPipelineProof) {
        const reason = benignSkip ? (body?.reason || "skipped_no_op")
          : rowAlreadyGone ? "row_already_gone" : null;
        await sb.from("sheet_write_queue")
          .update({ status: "done", last_error: reason, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", row.id);
        console.log("[sheet-queue] completed", {
          queue_id: row.id,
          operation: row.operation,
          lmp_code: lmpCode,
          sheet_row_found: body?.sheetRowFound ?? !body?.notFound,
          columns_updated: body?.columnsUpdated ?? body?.fieldsUpdated ?? [],
          result: reason ?? "done",
        });
        results.push({ id: row.id, status: reason ?? "done" });
      } else {
        const attempts = row.attempts + 1;
        const errMsg = missingPipelineProof
          ? "SHEET_PIPELINE_VERIFICATION_MISSING"
          : body?.error || body?.message || body?.reason || `HTTP ${res.status}`;
        // DUPLICATE_LMP_ID_ROWS is retryable — the edge function's auto-dedup
        // handles it on retry. Only structural header errors are truly fatal.
        const unsafeSheetIdentity = /^(MISSING_LMP_ID_HEADER|DUPLICATE_LMP_ID_HEADERS|MISALIGNED_LMP_ID_HEADER|MISALIGNED_LMP_TRACKER_HEADERS|LMP_ID_REQUIRED)/.test(String(errMsg));
        const giveUp = unsafeSheetIdentity || attempts >= MAX_ATTEMPTS;
        await sb.from("sheet_write_queue").update({
          status: giveUp ? "failed" : "pending",
          last_error: (body?.pipelineVerification
            ? `${errMsg}: ${JSON.stringify({
                lmp_code: lmpCode,
                rowNumber: body?.rowNumber,
                mismatches: body.pipelineVerification.mismatches,
                expected: body.pipelineVerification.expected,
                actual: body.pipelineVerification.actual,
              })}`
            : errMsg.toString()).slice(0, 500),
          next_retry_at: new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (rateLimited) {
          cooldownMap.set(row.tab_name, Date.now() + 60_000);
        }
        console.error("[sheet-queue] failed", {
          queue_id: row.id,
          operation: row.operation,
          lmp_code: lmpCode,
          failure_reason: errMsg,
          status: giveUp ? "failed" : "retry",
        });
        results.push({ id: row.id, status: giveUp ? "failed" : "retry", error: errMsg });
      }
    } catch (e) {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await sb.from("sheet_write_queue").update({
        status: giveUp ? "failed" : "pending",
        last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        next_retry_at: new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      console.error("[sheet-queue] exception", {
        queue_id: row.id,
        operation: row.operation,
        lmp_code: lmpCode,
        failure_reason: e instanceof Error ? e.message : String(e),
      });
      results.push({ id: row.id, status: giveUp ? "failed" : "retry", error: String(e) });
    }

    // Throttle between writes.
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
