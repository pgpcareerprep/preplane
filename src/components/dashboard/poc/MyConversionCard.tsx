import { Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { conversionTone } from "@/lib/pocCapability";
import { usePocCapability, usePocConversionMap, statsFor } from "@/lib/hooks/usePocCapabilityLive";
import { useRole } from "@/lib/rolesContext";

function toneRing(tone: "good" | "ok" | "low") {
  switch (tone) {
    case "good": return "ring-sage-200 bg-sage-50 text-sage-700";
    case "ok":   return "ring-yellow-200 bg-yellow-50 text-yellow-700";
    case "low":  return "ring-coral-200 bg-coral-50 text-coral-700";
  }
}

export function MyConversionCard() {
  const { user } = useRole();
  const me = user.pocProfileName || user.name || user.email;
  const cap = usePocCapability(me);
  const { map: convMap } = usePocConversionMap();
  const stats = statsFor(convMap, cap?.name || me);

  return (
    <section className="rounded-lg bg-card border border-n200 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="label-eyebrow mb-1">My Performance</div>
          <h3 className="text-[20px] font-medium text-n900">Conversion by capability</h3>
          <p className="text-[12px] text-n500 mt-1 max-w-md leading-relaxed">
            Your ranking score uses <span className="font-medium text-n700">Domain conversion only</span>.
            Cross-domain assignments are tracked separately and don't affect your score.
          </p>
        </div>
        {cap && (
          <div className="shrink-0 rounded-md border border-n200 bg-n50 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-[0.5px] text-n500 font-medium">Capability</div>
            <div className="mt-0.5 flex flex-wrap justify-end gap-1">
              {cap.domains.map((d) => (
                <span key={d} className="text-[11px] font-medium text-n700 bg-card border border-n200 rounded-full px-2 py-[1px]">
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-gutter">
        <Stat
          label="Domain Conversion"
          sub="Used for ranking"
          value={`${stats.domainPct}%`}
          detail={`${stats.domainConverted}/${stats.domainTotal} converted`}
          tone={conversionTone(stats.domainPct)}
          primary
        />
        <Stat
          label="Cross-Domain Conversion"
          sub="Stretch capability"
          value={stats.crossPct === null ? "—" : `${stats.crossPct}%`}
          detail={
            stats.crossPct === null
              ? "No cross-domain processes"
              : `${stats.crossConverted}/${stats.crossTotal} converted`
          }
          tone={stats.crossPct === null ? "ok" : conversionTone(stats.crossPct)}
        />
        <Stat
          label="Overall (reporting)"
          sub="All assignments"
          value={`${stats.overallPct}%`}
          detail={`${stats.overallConverted}/${stats.overallTotal} converted`}
          tone={conversionTone(stats.overallPct)}
          muted
        />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2.5 text-[12px] text-orange-800">
        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={2} />
        <span>
          Cross-domain results are not penalised. Focus on growing your in-domain
          conversion to improve your ranking score.
        </span>
      </div>
    </section>
  );
}

function Stat({
  label, sub, value, detail, tone, primary, muted,
}: {
  label: string; sub: string; value: string; detail: string;
  tone: "good" | "ok" | "low"; primary?: boolean; muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        primary ? "border-n300 bg-card ring-1 ring-orange-200/60" : "border-n200 bg-n50",
        muted && "opacity-90",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.5px] font-medium text-n600">{label}</span>
        {primary && (
          <span className="text-[9px] uppercase tracking-[0.5px] font-semibold text-orange-600 bg-orange-100 rounded-sm px-1.5 py-[1px]">
            Ranking
          </span>
        )}
        {muted && (
          <Info className="h-3 w-3 text-n400" strokeWidth={1.75} aria-label="Reporting only — not used in ranking" />
        )}
      </div>
      <div className="text-[10px] text-n500 mt-0.5">{sub}</div>
      <div className={cn(
        "mt-3 inline-flex items-center justify-center rounded-md px-2 py-1 ring-1 font-bold text-[28px] tabular-nums leading-none",
        toneRing(tone),
      )}>
        {value}
      </div>
      <div className="mt-2 text-[12px] text-n600 tabular-nums">{detail}</div>
    </div>
  );
}