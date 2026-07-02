/** Format deterministic execute_pending / cancel responses as chat SSE text. */

function changesFromSnapshots(
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined,
): { field: string; from?: string; to: string }[] {
  if (!previous || !next) return [];
  const out: { field: string; from?: string; to: string }[] = [];
  for (const [field, toVal] of Object.entries(next)) {
    const fromVal = previous[field];
    if (fromVal === undefined && toVal === undefined) continue;
    if (String(fromVal ?? "") === String(toVal ?? "")) continue;
    out.push({
      field,
      from: fromVal != null ? String(fromVal) : undefined,
      to: toVal != null ? String(toVal) : "",
    });
  }
  return out.slice(0, 8);
}

export function formatExecutePendingChatSse(parsed: Record<string, unknown>): string {
  const nested = (parsed.result as Record<string, unknown> | undefined) ?? {};
  const error = parsed.error ?? nested.error ?? parsed.reason;
  const blocked = parsed.blocked === true || nested.blocked === true;

  if (blocked || error) {
    const detail = String(error || parsed.reason || "Permission denied");
    return [
      `Could not complete that action: ${detail}`,
      "",
      ":::blocks",
      JSON.stringify([{
        type: "activity-feed",
        entries: [{ action: "Write execution", status: "error", details: detail }],
      }]),
      ":::",
    ].join("\n");
  }

  const succeeded = parsed.executed !== false && !error;
  const target = parsed.target as { company?: string; role?: string } | undefined;
  const label = target?.company && target?.role ? `${target.company} · ${target.role}` : "the record";
  const kind = String(parsed.kind || "update").replace(/_/g, " ");
  const summary = succeeded
    ? `Done — ${kind} applied to ${label}.`
    : `The staged action did not complete successfully.`;

  const changes = changesFromSnapshots(
    parsed.previous as Record<string, unknown> | undefined,
    parsed.new as Record<string, unknown> | undefined,
  );

  return [
    summary,
    "",
    ":::blocks",
    JSON.stringify([
      {
        type: "activity-feed",
        entries: [{
          action: kind,
          status: succeeded ? "success" : "error",
          details: summary,
        }],
      },
      ...(changes.length ? [{
        type: "info-card",
        title: "Changes applied",
        fields: changes.map((c) => ({
          label: c.field,
          value: c.from ? `${c.from} → ${c.to}` : c.to,
        })),
      }] : []),
      { type: "follow-ups", suggestions: ["Show updated record", "What else can I help with?"] },
    ]),
    ":::",
  ].join("\n");
}

export function formatCancelPendingChatSse(): string {
  return [
    "Action cancelled — no changes were made.",
    "",
    ":::blocks",
    JSON.stringify([{
      type: "activity-feed",
      entries: [{ action: "Cancelled staged change", status: "info", details: "The pending write was discarded." }],
    }]),
    ":::",
  ].join("\n");
}

export function formatCancelPendingErrorSse(message: string): string {
  return [
    `Could not cancel that action: ${message}`,
    "",
    ":::blocks",
    JSON.stringify([{
      type: "alert-cards",
      alerts: [{ severity: "warning", title: "Cancel failed", message }],
    }]),
    ":::",
  ].join("\n");
}
