import type { Process } from "@/lib/lmpProcessQueries";
import { LxAttentionStrip } from "@/components/insights/primitives";
import { summarizeFlags } from "@/lib/lmpFlags";
import type { LmpFlagKey } from "@/lib/lmpFlags";
import { info } from "@/lib/dashboardInfo";

export type SnapshotDrillKind = "active" | "zero-candidates" | LmpFlagKey;

export function RecentSnapshotStrip({
  rows, todaySet, onItemClick, zeroCandidateCount = 0, convertedCandidateCountByLmp,
}: {
  rows: Process[];
  todaySet: Set<string>;
  onItemClick?: (kind: SnapshotDrillKind) => void;
  zeroCandidateCount?: number;
  convertedCandidateCountByLmp?: Map<string, number>;
}) {
  const s = summarizeFlags(rows, todaySet, convertedCandidateCountByLmp);
  const active = rows.filter((r) => ["Ongoing", "Offer Received", "On Hold"].includes(r.status)).length;
  const click = (k: SnapshotDrillKind) => (onItemClick ? () => onItemClick(k) : undefined);
  return (
    <LxAttentionStrip
      columns={5}
      items={[
        { label: "Active LMPs", value: active, accent: "info", info: info("snapshot.active-lmps"), onClick: click("active") },
        { label: "Overdue", value: s.byKey["overdue"], accent: "risk", info: info("snapshot.overdue"), onClick: click("overdue") },
        { label: "Zero Candidates", value: zeroCandidateCount, accent: "orange", info: info("snapshot.zero-candidates"), onClick: click("zero-candidates") },
        { label: "Converted But Empty", value: s.byKey["converted-status-no-converted-candidate"], accent: "risk", info: info("snapshot.converted-status-no-converted-candidate"), onClick: click("converted-status-no-converted-candidate") },
        { label: "Update Due Today", value: s.byKey["daily-progress-pending"], accent: "yellow", info: info("snapshot.update-due-today"), onClick: click("daily-progress-pending") },
        { label: "Mentor Not Aligned", value: s.byKey["mentor-not-aligned"], accent: "risk", info: info("snapshot.mentor-not-aligned"), onClick: click("mentor-not-aligned") },
        { label: "Prep Doc Not Shared", value: s.byKey["prep-doc-not-shared"], accent: "orange", info: info("snapshot.prep-doc-not-shared"), onClick: click("prep-doc-not-shared") },
        { label: "Mock Pending", value: s.byKey["mock-pending"], accent: "yellow", info: info("snapshot.mock-pending"), onClick: click("mock-pending") },
        { label: "Stale", value: s.byKey["stale"], accent: "orange", info: info("snapshot.stale"), onClick: click("stale") },
        { label: "Not Started 4D+", value: s.byKey["not-started-stale-4d"], accent: "orange", info: info("snapshot.not-started-stale-4d"), onClick: click("not-started-stale-4d") },
      ]}
    />
  );
}
