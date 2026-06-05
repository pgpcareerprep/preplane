import { Link } from "react-router-dom";
import { LxCard, LxCardHeader, LX_HEX } from "@/components/insights/primitives";
import { useRecentTimeline } from "@/lib/hooks/useRecentTimeline";
import {
  Activity, UserPlus, Paperclip, CheckSquare, Users, MessageSquare, RefreshCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const EVENT_ICON: Record<string, LucideIcon> = {
  update: RefreshCcw,
  mentor: UserPlus,
  attachment: Paperclip,
  checklist: CheckSquare,
  "candidate-move": Users,
  remark: MessageSquare,
  progress: Activity,
  "no-update": Activity,
};

function relativeTime(iso: string): string {
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

export function RecentActivityCard({
  lmpIds, limit = 12, span = 5,
}: {
  lmpIds?: string[];
  limit?: number;
  span?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
}) {
  const { data: events = [], isLoading } = useRecentTimeline({ lmpIds, limit });

  return (
    <LxCard span={span}>
      <LxCardHeader
        eyebrow="Activity"
        title="Recent activity"
        hint="Latest updates from the LMP timeline."
      />
      <div className="max-h-[420px] overflow-y-auto pr-1">
      {isLoading ? (
        <div className="px-2 py-8 text-center text-[12px]" style={{ color: "var(--lx-text-3)" }}>
          Loading…
        </div>
      ) : events.length === 0 ? (
        <div className="px-2 py-8 text-center text-[12.5px]" style={{ color: "var(--lx-text-3)" }}>
          No activity yet.
        </div>
      ) : (
        <ul className="space-y-1">
          {events.map((ev) => {
            const Icon = EVENT_ICON[ev.eventType] || Activity;
            return (
              <li key={ev.id}>
                <Link
                  to={`/lmp/${ev.lmpId}`}
                  className="flex items-start gap-2.5 px-2 py-2 rounded-md transition-colors hover:bg-[var(--lx-soft)]"
                >
                  <span
                    className="grid place-items-center h-6 w-6 rounded-md shrink-0 mt-0.5"
                    style={{ background: "var(--lx-soft)", color: LX_HEX.info }}
                  >
                    <Icon size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] leading-snug line-clamp-2" style={{ color: "var(--lx-text)" }}>
                      {ev.description}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px]" style={{ color: "var(--lx-text-3)" }}>
                      <span>{ev.actor}</span>
                      <span>·</span>
                      <span>{relativeTime(ev.createdAt)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      </div>

    </LxCard>
  );
}
