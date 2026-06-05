import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Eye, History as HistoryIcon, RefreshCw, Loader2, Map as MapIcon, Download } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusKind = "synced" | "awaiting_first_sync" | "failed";

const STATUS_DOT: Record<StatusKind, string> = {
  synced: "bg-sage-400",
  awaiting_first_sync: "bg-sky-400",
  failed: "bg-coral-400",
};
const STATUS_LABEL: Record<StatusKind, string> = {
  synced: "Synced",
  awaiting_first_sync: "Awaiting sync",
  failed: "Sync failed",
};

/**
 * Read-only DB card (Domain Database, POC Database). Mirrors SourceCard styling
 * but without upload / template controls — data is synced from LMP Tracker.
 */
export function DbSourceCard({
  index = 0,
  icon: Icon,
  iconClass,
  title,
  badge = "DB",
  badgeClass,
  status,
  count,
  noun,
  lastSyncedAt,
  onViewAll,
  onViewHistory,
  viewAllLabel,
  onSync,
  syncing,
  onInspectMapping,
  onExport,
  showHistory = true,
}: {
  index?: number;
  icon: LucideIcon;
  iconClass: string;
  title: string;
  badge?: string;
  badgeClass: string;
  status: StatusKind;
  count: number;
  noun: string;
  lastSyncedAt?: string | null;
  onViewAll: () => void;
  onViewHistory: () => void;
  viewAllLabel: string;
  onSync?: () => void;
  syncing?: boolean;
  onInspectMapping?: () => void;
  onExport?: () => void;
  showHistory?: boolean;
}) {
  const hasData = count > 0;
  const lastSynced = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: [0, 0, 0.2, 1] }}
      className="rounded-lg bg-card border border-n200 shadow-sm p-6 flex flex-col"
    >
      <header className="flex items-start gap-3">
        <div className={cn("h-10 w-10 rounded-md grid place-items-center shrink-0", iconClass)}>
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[18px] font-medium text-n900 truncate">{title}</h4>
            <span className={cn("text-[10px] uppercase tracking-[0.5px] font-medium border rounded-full px-2 py-[2px]", badgeClass)}>
              {badge}
            </span>
          </div>
          <div className="text-[12px] text-n500 mt-1">Centralised, synced from LMP Tracker</div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-n700 shrink-0">
          <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[status])} />
          {STATUS_LABEL[status]}
        </span>
      </header>

      <div className="mt-5 space-y-1.5">
        <div className="text-[28px] font-semibold tracking-tight text-n900 tabular-nums leading-none">
          {count.toLocaleString()} <span className="text-[14px] font-normal text-n500">{noun}</span>
        </div>
        <div className="text-[12px] text-n500">
          {lastSynced ? `Last synced ${lastSynced}` : "Awaiting first sync from LMP Tracker"}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-n100 flex items-center gap-2 flex-wrap">
        <button
          onClick={onViewAll}
          disabled={!hasData}
          title={!hasData ? "No data synced yet" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 text-[13px] rounded-md px-3 py-2 transition-colors duration-150",
            hasData
              ? "bg-n900 text-white hover:bg-n800"
              : "bg-n100 text-n400 cursor-not-allowed",
          )}
        >
          <Eye className="h-3.5 w-3.5" /> {viewAllLabel}
        </button>
        {showHistory && (
          <button
            onClick={onViewHistory}
            className="inline-flex items-center gap-1.5 text-[13px] text-n600 hover:text-n900 hover:bg-n100 rounded-md px-2.5 py-2 transition-colors duration-150"
          >
            <HistoryIcon className="h-3.5 w-3.5" /> View History
          </button>
        )}
        {onExport && (
          <button
            onClick={onExport}
            disabled={!hasData}
            title={!hasData ? "No data to export" : "Download all rows as CSV"}
            className={cn(
              "inline-flex items-center gap-1.5 text-[13px] rounded-md px-2.5 py-2 transition-colors duration-150",
              hasData ? "text-n600 hover:text-n900 hover:bg-n100" : "text-n400 cursor-not-allowed",
            )}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        )}
        {onInspectMapping && (
          <button
            onClick={onInspectMapping}
            title="Inspect live Sheet ↔ DB column mapping"
            className="ml-auto inline-flex items-center gap-1.5 text-[13px] rounded-md px-2.5 py-2 border border-n200 text-n700 hover:bg-n50 transition-colors duration-150"
          >
            <MapIcon className="h-3.5 w-3.5" /> Mapping Inspector
          </button>
        )}
        {onSync && (
          <button
            onClick={onSync}
            disabled={syncing}
            title="Push DB edits to sheet, pull sheet edits to DB, then refresh"
            className={cn(
              "inline-flex items-center gap-1.5 text-[13px] rounded-md px-3 py-2 border transition-colors duration-150",
              !onInspectMapping && "ml-auto",
              syncing
                ? "border-n200 text-n400 cursor-not-allowed bg-n50"
                : "border-amber-200 text-amber-700 hover:bg-amber-50",
            )}
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncing ? "Syncing…" : "Sync"}
          </button>
        )}
      </div>
    </motion.section>
  );
}
