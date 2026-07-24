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
        { label: "No Updates > 3 Days", value: s.byKey["no-progress-3d"], accent: "orange", info: info("snapshot.no-progress-3d"), onClick: click("no-progress-3d") },
        { label: "Zero Candidates", value: zeroCandidateCount, accent: "orange", info: info("snapshot.zero-candidates"), onClick: click("zero-candidates") },
        { label: "Converted But Empty", value: s.byKey["converted-status-no-converted-candidate"], accent: "risk", info: info("snapshot.converted-status-no-converted-candidate"), onClick: click("converted-status-no-converted-candidate") },
        { label: "Dormant", value: s.byKey["inactive-20d"], accent: "orange", info: info("snapshot.inactive-20d"), onClick: click("inactive-20d") },
        { label: "Mentor Not Aligned", value: s.byKey["mentor-not-aligned"], accent: "risk", info: info("snapshot.mentor-not-aligned"), onClick: click("mentor-not-aligned") },
        { label: "Prep Document", value: s.byKey["prep-doc-pending"], accent: "orange", info: info("snapshot.prep-doc-pending"), onClick: click("prep-doc-pending") },
        { label: "Mock Conducted", value: s.byKey["mock-conducted"], accent: "success", info: info("snapshot.mock-conducted"), onClick: click("mock-conducted") },
        { label: "Status Unchanged > 7 Days", value: s.byKey["status-unchanged-7d"], accent: "orange", info: info("snapshot.status-unchanged-7d"), onClick: click("status-unchanged-7d") },
        { label: "Not Started 4D+", value: s.byKey["not-started-stale-4d"], accent: "orange", info: info("snapshot.not-started-stale-4d"), onClick: click("not-started-stale-4d") },
      ]}
    />
  );
}
