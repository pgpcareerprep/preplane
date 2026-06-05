import { Building2, GraduationCap, Globe, RefreshCw, Upload, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Source = {
  name: string;
  icon: LucideIcon;
  iconClass: string;
  lastSync: string;
  records: number;
  status: "synced" | "stale" | "error";
};

const SOURCES: Source[] = [
  { name: "Mentor Union", icon: Building2,      iconClass: "bg-teal-50 text-teal-600",   lastSync: "Synced 2 min ago",  records: 420, status: "synced" },
  { name: "Alumni DB",    icon: GraduationCap,  iconClass: "bg-orange-50 text-orange-600", lastSync: "Synced 9 days ago", records: 234, status: "stale" },
  { name: "Student DB",   icon: Globe,          iconClass: "bg-sky-400/10 text-sky-400",  lastSync: "Sync failed 3h ago", records: 193, status: "error" },
];

const STATUS_DOT = {
  synced: "bg-teal-400",
  stale:  "bg-yellow-400",
  error:  "bg-coral-400",
} as const;

const STATUS_LABEL = {
  synced: "Synced",
  stale:  "Stale",
  error:  "Error",
} as const;

export function DataSourceHealth() {
  return (
    <section className="rounded-lg bg-card border border-n200 shadow-sm p-6 flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-[20px] font-medium text-n900">Data Source Health</h3>
        <span className="text-[12px] text-n500">3 sources</span>
      </div>

      <ul className="divide-y divide-n100 -mx-2">
        {SOURCES.map(s => (
          <li
            key={s.name}
            className="flex items-center gap-4 px-2 py-3 rounded-md hover:bg-n50 transition-colors duration-150"
          >
            <div className={cn("h-10 w-10 rounded-md grid place-items-center", s.iconClass)}>
              <s.icon className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-medium text-n900">{s.name}</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-n500">
                  <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[s.status])} />
                  {STATUS_LABEL[s.status]}
                </span>
              </div>
              <div className="text-[12px] text-n500 mt-0.5">
                {s.lastSync} · <span className="tabular-nums">{s.records.toLocaleString()}</span> records
              </div>
            </div>
            <button className="inline-flex items-center gap-1.5 text-[12px] text-n600 hover:text-n900 hover:bg-n100 rounded-md px-2 py-1 transition-colors duration-150">
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
              Re-sync
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-5 pt-4 border-t border-n100">
        <button className="inline-flex items-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-3.5 py-2 shadow-sm transition-colors duration-150 ease-smooth">
          <Upload className="h-4 w-4" strokeWidth={1.75} />
          Upload CSV
        </button>
      </div>
    </section>
  );
}
