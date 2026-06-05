import { Link } from "react-router-dom";
import type { Process } from "@/lib/lmpProcessQueries";
import { LxCard, LxCardHeader, LX_HEX, type LxAccent } from "@/components/insights/primitives";
import { flagRows, type LmpFlagAccent, type FlaggedRow } from "@/lib/lmpFlags";

function relativeTime(iso: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function FlagPill({ accent, label }: { accent: LmpFlagAccent; label: string }) {
  const a: LxAccent = accent === "info" ? "info" : accent;
  const hex = LX_HEX[a];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border whitespace-nowrap"
      style={{ background: `${hex}14`, color: hex, borderColor: `${hex}40` }}
    >
      {label}
    </span>
  );
}

function ageBadge(age: number) {
  let color = "var(--lx-text-3)";
  let bg = "var(--lx-soft)";
  if (age > 30) { color = LX_HEX.risk; bg = `${LX_HEX.risk}14`; }
  else if (age > 20) { color = LX_HEX.orange; bg = `${LX_HEX.orange}14`; }
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums"
      style={{ background: bg, color }}
    >
      {age}d
    </span>
  );
}

export interface ActionRequiredCardProps {
  rows: Process[];
  todaySet: Set<string>;
  title?: string;
  eyebrow?: string;
  limit?: number;
  span?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  /** Restrict to high-priority only (used in admin overview). */
  highOnly?: boolean;
}

export function ActionRequiredCard({
  rows, todaySet, title = "Action required",
  eyebrow = "Pending actions", limit = 8, span = 7, highOnly = false,
}: ActionRequiredCardProps) {
  const all: FlaggedRow[] = flagRows(rows, todaySet);
  const items = (highOnly ? all.filter((r) => r.topPriority === "high") : all).slice(0, limit);
  const highCount = all.filter((r) => r.topPriority === "high").length;

  return (
    <LxCard span={span}>
      <LxCardHeader
        eyebrow={eyebrow}
        title={title}
        hint={`${all.length} flagged · ${highCount} high priority`}
      />
      <div className="max-h-[420px] overflow-y-auto pr-1">
      {items.length === 0 ? (
        <div className="px-2 py-10 text-center text-[12.5px]" style={{ color: "var(--lx-text-3)" }}>
          Nothing needs attention — nice.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--lx-border)" }}>
          {items.map(({ process, flags, age }) => (
            <li key={process.processId}>
              <Link
                to={`/lmp/${process.processId}`}
                className="block px-2 py-2.5 rounded-md transition-colors hover:bg-[var(--lx-soft)]"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[12.5px] font-medium truncate" style={{ color: "var(--lx-text)" }}>
                        {process.company} · {process.role}
                      </span>
                      {ageBadge(age)}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {flags.slice(0, 4).map((f) => (
                        <FlagPill key={f.key} accent={f.accent} label={f.label} />
                      ))}
                      {flags.length > 4 && (
                        <span className="text-[10px]" style={{ color: "var(--lx-text-3)" }}>+{flags.length - 4}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10.5px] font-medium" style={{ color: "var(--lx-text-2)" }}>
                      {process.status}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--lx-text-3)" }}>
                      {relativeTime(process.lastProgressUpdatedAt || process.lastUpdated)}
                    </div>
                  </div>
                  <span className="text-[12px] leading-none mt-1" style={{ color: "var(--lx-text-3)" }}>→</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      </div>

    </LxCard>
  );
}
