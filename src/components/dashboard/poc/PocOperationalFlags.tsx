import type { Process } from "@/lib/lmpProcessQueries";
import { summarizeFlags } from "@/lib/lmpFlags";
import type { LmpFlagKey } from "@/lib/lmpFlags";
import { info } from "@/lib/dashboardInfo";
import { LxInfo } from "@/components/insights/LxInfo";
import { LX_HEX, type LxAccent } from "@/components/insights/primitives";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CalendarClock, Clock, FileWarning, Flame, Layers, Mic, UserRound,
} from "lucide-react";

export type SnapshotDrillKind = "active" | "high" | LmpFlagKey;

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
  infoKey: string;
  kind: SnapshotDrillKind;
  icon: typeof Layers;
};

export function PocOperationalFlags({
  rows,
  todaySet,
  onItemClick,
}: {
  rows: Process[];
  todaySet: Set<string>;
  onItemClick?: (kind: SnapshotDrillKind) => void;
}) {
  const s = summarizeFlags(rows, todaySet);
  const active = rows.filter((r) => ["Ongoing", "Offer Received", "On Hold"].includes(r.status)).length;

  const flags: FlagDef[] = [
    { label: "Active LMPs", value: active, accent: "info", infoKey: "snapshot.active-lmps", kind: "active", icon: Layers },
    { label: "High Priority", value: s.high, accent: "risk", infoKey: "snapshot.high-priority", kind: "high", icon: Flame },
    { label: "Overdue", value: s.byKey.overdue, accent: "risk", infoKey: "snapshot.overdue", kind: "overdue", icon: AlertTriangle },
    { label: "Update Due Today", value: s.byKey["daily-progress-pending"], accent: "yellow", infoKey: "snapshot.update-due-today", kind: "daily-progress-pending", icon: CalendarClock },
    { label: "Mentor 20D+", value: s.byKey["mentor-pending-20d"], accent: "risk", infoKey: "snapshot.mentor-20d", kind: "mentor-pending-20d", icon: UserRound },
    { label: "Prep POC Pending", value: s.byKey["prep-doc-pending"], accent: "orange", infoKey: "snapshot.prep-doc-pending", kind: "prep-doc-pending", icon: FileWarning },
    { label: "Mock Pending", value: s.byKey["mock-pending"], accent: "yellow", infoKey: "snapshot.mock-pending", kind: "mock-pending", icon: Mic },
    { label: "Stale 14D+", value: s.byKey["status-stale-14d"], accent: "orange", infoKey: "snapshot.stale-14d", kind: "status-stale-14d", icon: Clock },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-x-6 gap-y-gutter">
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
