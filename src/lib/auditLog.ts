import { supabase } from "@/integrations/supabase/client";

export type AuditEntityType = "student" | "poc" | "lmp" | "domain" | "user" | "system";
export type AuditSource = "ui" | "sheet" | "copilot" | "sync";

type AuditEntry = {
  entity_type: AuditEntityType;
  entity_id?: string;
  action: string;
  actor_name: string;
  poc_role_type?: string;
  previous_value?: string;
  new_value?: string;
  metadata?: Record<string, unknown>;
  source?: AuditSource;
};

/**
 * Log an action to the activity_log table for audit trail.
 * Fire-and-forget — does not throw on failure.
 */
export async function logAuditEvent(entry: AuditEntry) {
  try {
    await supabase.from("activity_log").insert({
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
      action: entry.action,
      actor_name: entry.actor_name,
      poc_role_type: entry.poc_role_type ?? null,
      previous_value: entry.previous_value ?? null,
      new_value: entry.new_value ?? null,
      metadata: (entry.metadata ?? {}) as Record<string, string | number | boolean | null>,
      source: entry.source ?? "ui",
    });
  } catch {
    console.warn("[audit] Failed to log event", entry.action);
  }
}

/**
 * Log a field-level change with before/after values.
 * Creates one audit entry per field changed.
 */
export async function logFieldChanges(params: {
  entity_type: AuditEntityType;
  entity_id: string;
  actor_name: string;
  poc_role_type?: string;
  source?: AuditSource;
  changes: Record<string, { before: string | null; after: string | null }>;
  metadata?: Record<string, unknown>;
}) {
  const entries = Object.entries(params.changes).map(([field, { before, after }]) => ({
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    action: `field_update:${field}`,
    actor_name: params.actor_name,
    poc_role_type: params.poc_role_type ?? null,
    previous_value: before ?? null,
    new_value: after ?? null,
    metadata: {
      ...(params.metadata ?? {}),
      field,
      domain: (params.metadata as any)?.domain,
      lmp_id: (params.metadata as any)?.lmp_id,
    } as Record<string, string | number | boolean | null>,
    source: params.source ?? "ui",
  }));

  if (entries.length === 0) return;

  try {
    await supabase.from("activity_log").insert(entries);
  } catch {
    console.warn("[audit] Failed to log field changes for", params.entity_id);
  }
}

/**
 * Compute field-level diff between two objects.
 * Returns only fields that have changed.
 */
export function computeFieldDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  trackedFields?: string[]
): Record<string, { before: string | null; after: string | null }> {
  const changes: Record<string, { before: string | null; after: string | null }> = {};
  const fields = trackedFields ?? [...new Set([...Object.keys(before), ...Object.keys(after)])];

  for (const field of fields) {
    const bVal = before[field] ?? null;
    const aVal = after[field] ?? null;
    const bStr = bVal === null ? null : String(bVal);
    const aStr = aVal === null ? null : String(aVal);
    if (bStr !== aStr) {
      changes[field] = { before: bStr, after: aStr };
    }
  }
  return changes;
}

/**
 * Fetch audit trail for a specific entity.
 */
export async function getAuditTrail(entityType: AuditEntityType, entityId: string, limit = 50) {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/**
 * Rollback a specific audit entry by applying the previous value.
 * Returns the patch to apply. Caller is responsible for applying it.
 */
export function createRollbackPatch(auditEntry: {
  action: string;
  previous_value: string | null;
  metadata: Record<string, unknown> | null;
}): { field: string; value: string | null } | null {
  const match = auditEntry.action.match(/^field_update:(.+)$/);
  if (!match) return null;
  const field = match[1];
  return { field, value: auditEntry.previous_value };
}
