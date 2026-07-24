/** Prep document tri-state stored on `lmp_processes.prep_doc_status`. */
export type PrepDocStatus = "shared" | "pending" | "na";

export const PREP_DOC_STATUS_OPTIONS: { value: PrepDocStatus; label: string; title: string }[] = [
  { value: "shared", label: "Shared", title: "Prep document shared" },
  { value: "pending", label: "Pending", title: "Prep document pending" },
  { value: "na", label: "N/A", title: "Not required" },
];

/** Prefer explicit status; fall back to legacy boolean when status is unset. */
export function resolvePrepDocStatus(
  status?: PrepDocStatus | string | null,
  shared?: boolean | null,
): PrepDocStatus {
  if (status === "shared" || status === "pending" || status === "na") return status;
  return shared ? "shared" : "pending";
}

export function prepDocStatusLabel(status: PrepDocStatus): string {
  return PREP_DOC_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}
