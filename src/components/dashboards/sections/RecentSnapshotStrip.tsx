import type { Process } from "@/lib/lmpProcessQueries";
import { LxAttentionStrip } from "@/components/insights/primitives";
import { summarizeFlags } from "@/lib/lmpFlags";
import type { LmpFlagKey } from "@/lib/lmpFlags";
import { info } from "@/lib/dashboardInfo";

export type SnapshotDrillKind = "active" | "high" | LmpFlagKey;

export function RecentSnapshotStrip({
  rows, todaySet, onItemClick,
}: {
  rows: Process[];
  todaySet: Set<string>;
  onItemClick?: (kind: SnapshotDrillKind) => void;
}) {
  const s = summarizeFlags(rows, todaySet);
  const active = rows.filter((r) => ["Ongoing", "Offer Received", "On Hold"].includes(r.status)).length;
  const click = (k: SnapshotDrillKind) => (onItemClick ? () => onItemClick(k) : undefined);
  return (
    <LxAttentionStrip
      items={[
        { label: "Active LMPs",      value: active,                          accent: "info",   info: info("snapshot.active-lmps"),     onClick: click("active") },
        { label: "High priority",    value: s.high,                          accent: "risk",   info: info("snapshot.high-priority"),   onClick: click("high") },
        { label: "Overdue",          value: s.byKey["overdue"],              accent: "risk",   info: info("snapshot.overdue"),         onClick: click("overdue") },
        { label: "Update due today", value: s.byKey["daily-progress-pending"], accent: "yellow", info: info("snapshot.update-due-today"), onClick: click("daily-progress-pending") },
        { label: "Mentor 20d+",      value: s.byKey["mentor-pending-20d"],   accent: "risk",   info: info("snapshot.mentor-20d"),      onClick: click("mentor-pending-20d") },
        { label: "Prep doc pending", value: s.byKey["prep-doc-pending"],     accent: "orange", info: info("snapshot.prep-doc-pending"), onClick: click("prep-doc-pending") },
        { label: "Mock pending",     value: s.byKey["mock-pending"],         accent: "yellow", info: info("snapshot.mock-pending"),    onClick: click("mock-pending") },
        { label: "Stale 14d+",       value: s.byKey["status-stale-14d"],     accent: "orange", info: info("snapshot.stale-14d"),       onClick: click("status-stale-14d") },
      ]}
    />
  );
}
