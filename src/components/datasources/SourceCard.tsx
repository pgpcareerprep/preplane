import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { AlertTriangle, Download, Eye, History as HistoryIcon, User2 } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusKind = "synced" | "awaiting_first_sync" | "failed";

const STATUS_DOT: Record<StatusKind, string> = {
  synced: "bg-sage-400",
  awaiting_first_sync: "bg-sky-400",
  failed: "bg-coral-400",
};
const STATUS_LABEL: Record<StatusKind, string> = {
  synced: "Synced",
  awaiting_first_sync: "Awaiting first sync",
  failed: "Sync failed",
};

export function SourceCard({
  index = 0,
  icon: Icon,
  iconClass,
  title,
  badge,
  badgeClass,
  status,
  count,
  noun,
  lastUploadedAt,
  uploadedBy,
  isAdmin,
  onUpload,
  onDownloadTemplate,
  onViewAll,
  onViewHistory,
  viewAllLabel,
  failureReason,
  onExport,
  canDownloadTemplate,
  showHistory = true,
}: {
  index?: number;
  icon: LucideIcon;
  iconClass: string;
  title: string;
  badge: string;
  badgeClass: string;
  status: StatusKind;
  count: number;
  noun: string; // "mentors" / "alumni"
  lastUploadedAt?: string | null;
  uploadedBy?: string | null;
  isAdmin: boolean;
  onUpload: () => void;
  onDownloadTemplate: () => void;
  onViewAll: () => void;
  onViewHistory: () => void;
  viewAllLabel: string;
  failureReason?: string | null;
  onExport?: () => void;
  canDownloadTemplate?: boolean;
  showHistory?: boolean;
}) {
  const hasData = count > 0;
  const showDownloadTemplate = canDownloadTemplate ?? isAdmin;
  const lastUpdated = lastUploadedAt
    ? new Date(lastUploadedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: [0, 0, 0.2, 1] }}
      className="rounded-2xl bg-card border border-n200 shadow-sm p-6 flex flex-col"
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
          <div className="text-[12px] text-n500 mt-1">Centralised, shared across all users</div>
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
          {lastUpdated ? `Last updated ${lastUpdated}` : "No uploads yet"}
        </div>
        {uploadedBy && (
          <div className="inline-flex items-center gap-1 text-[12px] text-n500">
            <User2 className="h-3 w-3" /> by {uploadedBy}
          </div>
        )}
      </div>

      {status === "failed" && failureReason && (
        <div className="mt-4 rounded-md border border-coral-200 bg-coral-50 p-3 text-[12px] text-coral-700 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium text-coral-800">Last sync failed</div>
            <div className="mt-0.5 text-coral-700/90 break-words line-clamp-3">{failureReason}</div>
            {isAdmin && (
              <button
                onClick={onUpload}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-coral-800 hover:text-coral-900 underline underline-offset-2"
              >
                Re-upload CSV
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-n100 flex items-center gap-2 flex-wrap">
        <button
          onClick={onViewAll}
          disabled={!hasData}
          title={!hasData ? "No data uploaded yet" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 text-[13px] rounded-md px-2.5 py-2 transition-colors duration-150",
            hasData ? "bg-n900 text-white hover:bg-n800" : "bg-n100 text-n400 cursor-not-allowed",
          )}
        >
          <Eye className="h-3.5 w-3.5" /> {viewAllLabel}
        </button>
        {showDownloadTemplate && (
          <button
            onClick={onDownloadTemplate}
            className="inline-flex items-center gap-1.5 text-[13px] text-n600 hover:text-n900 hover:bg-n100 rounded-md px-2.5 py-2 transition-colors duration-150"
          >
            <Download className="h-3.5 w-3.5" /> Download Template
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
        {(isAdmin || showHistory) && (
          <span className="mx-1 h-5 w-px bg-n200" aria-hidden />
        )}
        {isAdmin && (
          <button
            onClick={onUpload}
            className="inline-flex items-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-3.5 py-2 shadow-sm transition-colors duration-150"
          >
            Upload CSV
          </button>
        )}
        {showHistory && (
          <button
            onClick={onViewHistory}
            className="inline-flex items-center gap-1.5 text-[13px] text-n600 hover:text-n900 hover:bg-n100 rounded-md px-2.5 py-2 transition-colors duration-150"
          >
            <HistoryIcon className="h-3.5 w-3.5" /> View History
          </button>
        )}
      </div>
    </motion.section>
  );
}
