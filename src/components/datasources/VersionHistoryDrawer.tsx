import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { History, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type VersionRow = {
  version: string;
  date: string;
  records: number;
  active?: boolean;
};

export function VersionHistoryDrawer({ source, versions }: { source: string; versions: VersionRow[] }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-[13px] text-n600 hover:text-n900 hover:bg-n100 rounded-md px-2 py-1 transition-colors duration-150">
          <History className="h-3.5 w-3.5" strokeWidth={1.5} />
          View History
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[400px] sm:w-[400px] sm:max-w-[400px] bg-card p-0 border-l border-n200"
      >
        <SheetHeader className="px-6 py-5 border-b border-n200 text-left">
          <div className="label-eyebrow">{source}</div>
          <SheetTitle className="text-[20px] font-medium text-n900 mt-1">Version history</SheetTitle>
          <p className="text-[12px] text-n500 mt-0.5">{versions.length} versions saved.</p>
        </SheetHeader>

        <div className="px-2 py-4 overflow-y-auto h-[calc(100vh-110px)]">
          <ol className="relative ml-5 border-l border-n200">
            {versions.map((v, i) => (
              <li key={v.version} className="pl-6 pr-3 pb-5 last:pb-0 relative group">
                <span className={cn(
                  "absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white",
                  v.active ? "bg-orange-500 ring-2 ring-orange-200" : i === 0 ? "bg-n400" : "bg-n300",
                )} />
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-n900 tabular-nums">{v.version}</span>
                    {v.active && (
                      <span className="text-[10px] uppercase tracking-[0.5px] font-medium bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-2 py-[1px]">
                        Active
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-n500">{v.date}</span>
                </div>
                <div className="text-[12px] text-n500 mt-0.5 tabular-nums">
                  {v.records.toLocaleString()} records
                </div>
                {!v.active && (
                  <button className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-n600 hover:text-orange-600 hover:bg-orange-50 rounded-md px-2 py-1 transition-colors duration-150">
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      </SheetContent>
    </Sheet>
  );
}
