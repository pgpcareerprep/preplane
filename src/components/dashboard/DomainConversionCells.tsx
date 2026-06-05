import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  conversionTone,
  type PocConversionStats,
} from "@/lib/pocCapability";

function toneClasses(tone: "good" | "ok" | "low") {
  switch (tone) {
    case "good": return "text-sage-700 bg-sage-50 border-sage-200";
    case "ok":   return "text-yellow-700 bg-yellow-50 border-yellow-200";
    case "low":  return "text-coral-600 bg-coral-50 border-coral-200";
  }
}

/** Compact 3-stat cluster: Domain (primary) · Cross · Overall. */
export function DomainConversionCluster({
  stats,
  size = "sm",
}: {
  stats: PocConversionStats;
  size?: "sm" | "md";
}) {
  const big = size === "md";
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold tabular-nums",
          big ? "text-[14px]" : "text-[12px]",
          toneClasses(conversionTone(stats.domainPct)),
        )}
        title={`Domain conversion: ${stats.domainConverted}/${stats.domainTotal}`}
      >
        {stats.domainPct}%
        <span className="text-[9px] uppercase tracking-[0.5px] font-medium opacity-70">dom</span>
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-n500 tabular-nums",
          big ? "text-[12px]" : "text-[11px]",
        )}
        title={
          stats.crossPct === null
            ? "No cross-domain assignments"
            : `Cross-domain conversion: ${stats.crossConverted}/${stats.crossTotal} — does not affect ranking`
        }
      >
        <span className="text-[9px] uppercase tracking-[0.5px] font-medium">crs</span>
        {stats.crossPct === null ? "—" : `${stats.crossPct}%`}
      </span>
      <span
        className={cn(
          "text-n400 tabular-nums",
          big ? "text-[12px]" : "text-[11px]",
        )}
        title={`Overall: ${stats.overallConverted}/${stats.overallTotal} — reporting only`}
      >
        · {stats.overallPct}% all
      </span>
    </div>
  );
}

/** Domain fit summary: ✔ in-domain count + ⚠ cross count. */
export function DomainFitChips({ stats }: { stats: PocConversionStats }) {
  return (
    <div className="inline-flex items-center gap-2 text-[12px]">
      <span className="inline-flex items-center gap-1 text-sage-700 tabular-nums" title="In-domain assignments">
        <span aria-hidden>✔</span>{stats.domainTotal}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 tabular-nums",
          stats.crossTotal > 0 ? "text-yellow-700" : "text-n400",
        )}
        title="Cross-domain assignments — do not affect ranking score"
      >
        <span aria-hidden>⚠</span>{stats.crossTotal}
      </span>
    </div>
  );
}

/** Header label with tooltip explaining the strict ranking model. */
export function ConversionHeader() {
  return (
    <span className="inline-flex items-center gap-1">
      Conversion
      <Info
        className="h-3 w-3 text-n400"
        strokeWidth={1.75}
        aria-label="Ranking uses Domain conversion only. Cross-domain shown for visibility."
      >
        <title>Ranking uses Domain conversion only. Cross-domain shown for visibility.</title>
      </Info>
    </span>
  );
}