import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { usePocCapabilityList, usePocConversionMap, statsFor } from "@/lib/hooks/usePocCapabilityLive";
import { DomainConversionCluster, DomainFitChips, ConversionHeader } from "./DomainConversionCells";

type Row = {
  name: string;
  initials: string;
  domains: string[];
  active: number;
  threshold: number;
  health: "healthy" | "slow" | "stuck";
  type: "domain" | "behavioral";
};

function healthFromLoad(active: number, threshold: number): Row["health"] {
  const pct = (active / Math.max(1, threshold)) * 100;
  if (pct >= 95) return "stuck";
  if (pct >= 75) return "slow";
  return "healthy";
}

const HEALTH_DOT = { healthy: "bg-sage-400", slow: "bg-yellow-400", stuck: "bg-coral-400" } as const;
const HEALTH_LBL = { healthy: "Healthy", slow: "Slow", stuck: "Stuck" } as const;

function loadColor(p: number) {
  if (p >= 85) return "bg-coral-400";
  if (p >= 60) return "bg-yellow-400";
  return "bg-sage-400";
}

export function ModPocWorkloadTable() {
  const { list, isLoading } = usePocCapabilityList();
  const { map: convMap } = usePocConversionMap();

  const rows = useMemo<Row[]>(() => {
    return list
      .map((p) => ({
        name: p.name,
        initials: p.initials,
        domains: p.behavioralPoolMember ? ["Behavioral Pool"] : (p.domains.length ? p.domains : ["—"]),
        active: p.currentLoad,
        threshold: p.maxThreshold,
        health: healthFromLoad(p.currentLoad, p.maxThreshold),
        type: p.behavioralPoolMember ? ("behavioral" as const) : ("domain" as const),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "domain" ? -1 : 1;
        return statsFor(convMap, b.name).rankingScore - statsFor(convMap, a.name).rankingScore;
      });
  }, [list, convMap]);

  return (
    <section className="rounded-2xl bg-card border border-n200 shadow-sm p-6">
      <div className="flex items-baseline justify-between mb-5">
        <h3 className="text-[20px] font-medium text-n900">POC Workload</h3>
        <button className="inline-flex items-center gap-1 text-[13px] font-medium text-orange-500 hover:text-orange-600 transition-colors duration-150">
          Manage <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded bg-n100 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-n500 py-6 text-center">No POCs configured yet.</p>
      ) : (
      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-n500 text-[11px] uppercase tracking-[0.5px]">
              <th className="font-medium px-6 py-2">POC</th>
              <th className="font-medium px-3 py-2">Type</th>
              <th className="font-medium px-3 py-2">Domains</th>
              <th className="font-medium px-3 py-2">Domain Fit</th>
              <th className="font-medium px-3 py-2"><ConversionHeader /></th>
              <th className="font-medium px-3 py-2 text-right">Active / Max</th>
              <th className="font-medium px-3 py-2 w-[200px]">Load</th>
              <th className="font-medium px-3 py-2">Health</th>
              <th className="font-medium px-6 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const pct = Math.min(100, Math.round((r.active / Math.max(1, r.threshold)) * 100));
              const stats = statsFor(convMap, r.name);
              return (
                <tr
                  key={r.name}
                  className={cn(
                    "border-t border-n100 transition-colors duration-150 hover:bg-orange-50/40",
                    idx % 2 === 1 && "bg-n50",
                  )}
                >
                  <td className="px-6 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-n900 text-white grid place-items-center text-[10px] font-medium">
                        {r.initials}
                      </div>
                      <span className="text-n900 font-medium">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                      r.type === "behavioral"
                        ? "bg-plum-400/10 text-plum-400 border-plum-400/30"
                        : "bg-teal-50 text-teal-700 border-teal-200",
                    )}>
                      {r.type === "behavioral" ? "Behavioral" : "Domain"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {r.domains.map(d => (
                        <span key={d} className="text-[10px] uppercase tracking-[0.5px] font-medium bg-n100 text-n600 border border-n200 rounded-full px-2 py-[1px]">
                          {d}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <DomainFitChips stats={stats} />
                  </td>
                  <td className="px-3 py-2.5">
                    <DomainConversionCluster stats={stats} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-n800 tabular-nums">{r.active} / {r.threshold}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="relative h-1.5 w-[140px] rounded-full bg-n200 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-[width] duration-500 ease-smooth", loadColor(pct))}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[12px] text-n600 tabular-nums w-9">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-n700">
                      <span className={cn("h-2 w-2 rounded-full", HEALTH_DOT[r.health])} />
                      {HEALTH_LBL[r.health]}
                    </span>
                  </td>
                  <td className="px-6 py-2.5 text-right">
                    <button className="inline-flex items-center gap-1 text-[12px] text-n600 hover:text-n900 hover:bg-n100 rounded-md px-2 py-1 transition-colors duration-150">
                      View Reqs <ArrowRight className="h-3 w-3" strokeWidth={2} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}
