import { Paperclip } from "lucide-react";
import type { LmpRecord } from "@/lib/lmpTypes";

export function JdSummaryCard({ rec }: { rec: LmpRecord }) {
  const seniority = (rec as any).jdSeniority ?? (rec as any).seniority ?? "—";
  return (
    <div className="rounded-2xl bg-card border border-n200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[13px] font-semibold text-n800">JD Summary</h4>
        <span className="inline-flex items-center gap-1 text-[11px] text-n500">
          <Paperclip className="h-3 w-3" /> JD attached
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <Row label="Company" value={rec.company} />
        <Row label="Role" value={rec.role} />
        <Row label="Domain" value={rec.domain} />
        <Row label="Seniority" value={seniority} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-n500">{label}</dt>
      <dd className="text-n800 font-medium truncate" title={value}>
        {value}
      </dd>
    </>
  );
}
