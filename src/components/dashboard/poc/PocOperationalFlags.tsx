import type { Process } from "@/lib/lmpProcessQueries";
import { summarizeFlags } from "@/lib/lmpFlags";
import type { LmpFlagKey } from "@/lib/lmpFlags";
import { info, type DashboardInfoKey } from "@/lib/dashboardInfo";
import { LxInfo } from "@/components/insights/LxInfo";
import { LX_HEX, type LxAccent } from "@/components/insights/primitives";
import { cn } from "@/lib/utils";
import {
  CalendarClock, CircleAlert, CircleDashed, Clock, FileText, Layers, Mic, Moon, UserRound, Users,
} from "lucide-react";

export type SnapshotDrillKind = "active" | "zero-candidates" | LmpFlagKey;

const ACCENT_HEX: Record<LxAccent, string> = LX_HEX;

const SOFT_BG: Record<LxAccent, string> = {
  orange: "rgba(227,131,48,0.10)",
  yellow: "rgba(247,211,68,0.18)",
  success: "rgba(106,158,98,0.12)",
  risk: "rgba(240,112,64,0.12)",
  info: "rgba(74,142,232,0.12)",
  ai: "rgba(109,40,217,0.14)",
  teal: "rgba(57,182,216,0.12)",
  neutral: "rgba(122,117,108,0.10)",
};

type FlagDef = {
  label: string;
  value: number;
  accent: LxAccent;
  infoKey: DashboardInfoKey;
  kind: SnapshotDrillKind;
  icon: typeof Layers;
};

export function PocOperationalFlags({
  rows,
  todaySet,
  onItemClick,
  zeroCandidateCount = 0,
  convertedCandidateCountByLmp,
}: {
  rows: Process[];
  todaySet: Set<string>;
  onItemClick?: (kind: SnapshotDrillKind) => void;
  zeroCandidateCount?: number;
  convertedCandidateCountByLmp?: Map<string, number>;
}) {
  const s = summarizeFlags(rows, todaySet, convertedCandidateCountByLmp);
  const active = rows.filter((r) => ["Ongoing", "Offer Received", "On Hold"].includes(r.status)).length;

  const flags: FlagDef[] = [
    { label: "Active LMPs", value: active, accent: "info", infoKey: "snapshot.active-lmps", kind: "active", icon: Layers },
    { label: "No Updates > 3 Days", value: s.byKey["no-progress-3d"], accent: "orange", infoKey: "snapshot.no-progress-3d", kind: "no-progress-3d", icon: CalendarClock },
    { label: "Zero Candidates", value: zeroCandidateCount, accent: "orange", infoKey: "snapshot.zero-candidates", kind: "zero-candidates", icon: Users },
    { label: "Converted But Empty", value: s.byKey["converted-status-no-converted-candidate"], accent: "risk", infoKey: "snapshot.converted-status-no-converted-candidate", kind: "converted-status-no-converted-candidate", icon: CircleAlert },
    { label: "Dormant", value: s.byKey["inactive-20d"], accent: "orange", infoKey: "snapshot.inactive-20d", kind: "inactive-20d", icon: Moon },
    { label: "Mentor Not Aligned", value: s.byKey["mentor-not-aligned"], accent: "risk", infoKey: "snapshot.mentor-not-aligned", kind: "mentor-not-aligned", icon: UserRound },
    { label: "Prep Document", value: s.byKey["prep-doc-pending"], accent: "orange", infoKey: "snapshot.prep-doc-pending", kind: "prep-doc-pending", icon: FileText },
    { label: "Mock Conducted", value: s.byKey["mock-conducted"], accent: "success", infoKey: "snapshot.mock-conducted", kind: "mock-conducted", icon: Mic },
    { label: "Status Unchanged > 7 Days", value: s.byKey["status-unchanged-7d"], accent: "orange", infoKey: "snapshot.status-unchanged-7d", kind: "status-unchanged-7d", icon: Clock },
    { label: "Not Started 4D+", value: s.byKey["not-started-stale-4d"], accent: "orange", infoKey: "snapshot.not-started-stale-4d", kind: "not-started-stale-4d", icon: CircleDashed },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-gutter">
      {flags.map(({ label, value, accent, infoKey, kind, icon: Icon }) => {
        const clickable = !!onItemClick;
        const hex = ACCENT_HEX[accent];
        return (
          <button
            key={kind}
            type="button"
            disabled={!clickable}
            onClick={clickable ? () => onItemClick!(kind) : undefined}
            className={cn(
              "flex flex-col gap-2 rounded-xl border p-3 text-left min-h-[88px] transition-colors",
              clickable && "hover:bg-[var(--lx-soft)] cursor-pointer",
            )}
            style={{
              background: "var(--lx-surface)",
              borderColor: "var(--lx-border)",
              borderWidth: 0.5,
            }}
          >
            <span
              className="h-8 w-8 rounded-lg grid place-items-center shrink-0"
              style={{ background: SOFT_BG[accent], color: hex }}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="text-[10px] font-medium uppercase tracking-[0.45px] leading-tight inline-flex items-center gap-0.5" style={{ color: "var(--lx-text-3)" }}>
                {label}
                <LxInfo text={info(infoKey)} size={10} />
              </span>
              <span className="block text-[18px] font-bold tabular-nums leading-none mt-1" style={{ color: "var(--lx-text)" }}>
                {value}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
