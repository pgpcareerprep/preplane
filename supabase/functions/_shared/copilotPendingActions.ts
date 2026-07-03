import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type PendingActionSource = "chat" | "voice";

export type StagedPendingInput = {
  userId: string;
  actorName: string | null;
  role: string;
  kind: string;
  payload: Record<string, unknown>;
  currentSnapshot?: Record<string, unknown> | null;
  proposedSnapshot?: Record<string, unknown> | null;
  source: PendingActionSource;
};

export type LoadedPendingAction = {
  id: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
  currentSnapshot: Record<string, unknown>;
  proposedSnapshot: Record<string, unknown>;
  role: string;
};

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function markExpiredPendingActions(): Promise<void> {
  await serviceClient()
    .from("copilot_pending_actions")
    .update({ status: "expired" })
    .eq("status", "staged")
    .lt("expires_at", new Date().toISOString());
}

export async function stagePendingAction(
  input: StagedPendingInput,
): Promise<{ id: string; expiresAt: string } | { error: string }> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { data, error } = await serviceClient()
    .from("copilot_pending_actions")
    .insert({
      user_id: input.userId,
      actor_name: input.actorName,
      role: input.role,
      action_kind: input.kind,
      payload: input.payload,
      current_snapshot: input.currentSnapshot ?? null,
      proposed_snapshot: input.proposedSnapshot ?? null,
      status: "staged",
      source: input.source,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id as string, expiresAt };
}

export async function loadStagedPendingAction(
  id: string,
  userId: string,
): Promise<LoadedPendingAction | { error: string; code: string }> {
  await markExpiredPendingActions();
  const { data, error } = await serviceClient()
    .from("copilot_pending_actions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return { error: "Pending action not found", code: "not_found" };
  if (data.user_id !== userId) return { error: "Pending action not found", code: "user_mismatch" };
  if (data.status === "executed") return { error: "Action already executed", code: "already_executed" };
  if (data.status === "cancelled") return { error: "Action was cancelled", code: "cancelled" };
  if (data.status === "expired" || new Date(String(data.expires_at)) < new Date()) {
    return { error: "Pending action expired", code: "expired" };
  }
  if (data.status !== "staged" && data.status !== "pending") {
    return { error: `Invalid pending status: ${data.status}`, code: "invalid_status" };
  }
  return {
    id: data.id as string,
    userId: data.user_id as string,
    kind: data.action_kind as string,
    payload: (data.payload as Record<string, unknown>) ?? {},
    currentSnapshot: (data.current_snapshot as Record<string, unknown>) ?? {},
    proposedSnapshot: (data.proposed_snapshot as Record<string, unknown>) ?? {},
    role: data.role as string,
  };
}

/** Atomically claim a staged row for execution (staged → pending lock). */
export async function claimPendingActionForExecution(
  id: string,
  userId: string,
): Promise<LoadedPendingAction | { error: string; code: string }> {
  await markExpiredPendingActions();
  const { data, error } = await serviceClient()
    .from("copilot_pending_actions")
    .update({ status: "pending" })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "staged")
    .gt("expires_at", new Date().toISOString())
    .select("*")
    .maybeSingle();
  if (error || !data) {
    const peek = await loadStagedPendingAction(id, userId);
    if (!("error" in peek) && peek) {
      return { error: "Action already executed or expired", code: "already_executed" };
    }
    return peek;
  }
  return {
    id: data.id as string,
    userId: data.user_id as string,
    kind: data.action_kind as string,
    payload: (data.payload as Record<string, unknown>) ?? {},
    currentSnapshot: (data.current_snapshot as Record<string, unknown>) ?? {},
    proposedSnapshot: (data.proposed_snapshot as Record<string, unknown>) ?? {},
    role: data.role as string,
  };
}

/** Mark in-flight pending action complete or release back to staged for retry. */
export async function finalizePendingActionExecution(
  id: string,
  userId: string,
  success: boolean,
): Promise<void> {
  await serviceClient()
    .from("copilot_pending_actions")
    .update({
      status: success ? "executed" : "staged",
      executed_at: success ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "pending");
}

export async function cancelPendingAction(
  id: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await serviceClient()
    .from("copilot_pending_actions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .in("status", ["staged", "pending"])
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not cancel pending action" };
  return { ok: true };
}
