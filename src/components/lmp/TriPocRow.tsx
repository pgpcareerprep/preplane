import { cn } from "@/lib/utils";
import { TAG_STYLES, type AllocationTag } from "@/lib/pocAllocation";

type Poc = { name: string; initials: string; color: string };

/**
 * Tri-POC display row — shows Prep (P), Support (S), and Outreach (O) POC circles.
 * Prep = Prep POC, Support = Support POC, Outreach = Outreach POC.
 */
export function TriPocRow({
  prepPoc,
  supportPoc,
  outreachPoc,
  // deprecated compat props
  domainPoc,
  behavioralPoc,
  tags,
  jdMode,
  size = "md",
  showLabels = true,
  className,
}: {
  prepPoc?: Poc;
  supportPoc?: Poc | null;
  outreachPoc?: Poc | null;
  /** @deprecated Use prepPoc instead */
  domainPoc?: Poc;
  /** @deprecated Use supportPoc instead */
  behavioralPoc?: Poc | null;
  tags?: AllocationTag[];
  jdMode?: "FULL_SCORING" | "LOAD_ONLY";
  size?: "sm" | "md";
  showLabels?: boolean;
  className?: string;
}) {
  // Resolve with compat fallbacks
  const resolvedPrep = prepPoc || domainPoc;
  const resolvedSupport = supportPoc !== undefined ? supportPoc : behavioralPoc;

  const hasPrimary = resolvedPrep && resolvedPrep.name;
  const hasSecondary = resolvedSupport && resolvedSupport.name && resolvedSupport.name !== resolvedPrep?.name;
  const hasOutreach = outreachPoc && outreachPoc.name;
  const av = size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-[11px]";
  const badge = size === "sm" ? "h-3 w-3 text-[7px]" : "h-3.5 w-3.5 text-[8px]";

  return (
    <div className={cn("flex flex-col gap-1.5 py-[6px]", className)}>
      <div className="flex items-center gap-3">
        {hasPrimary && (
          <PocCircle
            poc={resolvedPrep!}
            label="P"
            badgeBg="bg-orange-500"
            size={av}
            badgeSize={badge}
            showName={showLabels}
            title="Prep"
          />
        )}
        {hasSecondary && (
          <PocCircle
            poc={resolvedSupport!}
            label="S"
            badgeBg="bg-sky-500"
            size={av}
            badgeSize={badge}
            showName={showLabels}
            title="Support"
          />
        )}
        {hasOutreach && (
          <PocCircle
            poc={outreachPoc!}
            label="O"
            badgeBg="bg-emerald-500"
            size={av}
            badgeSize={badge}
            showName={showLabels}
            title="Outreach"
          />
        )}
      </div>
      {(tags?.length || jdMode === "LOAD_ONLY") && (
        <div className="flex flex-wrap items-center gap-1">
          {jdMode === "LOAD_ONLY" && (
            <span className="inline-flex items-center rounded-full border bg-yellow-50 text-yellow-700 border-yellow-300 px-1.5 py-[1px] text-[10px] font-medium">
              LOAD_ONLY
            </span>
          )}
          {tags?.map((t) => (
            <span
              key={t}
              className={cn(
                "inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-medium",
                TAG_STYLES[t],
              )}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** @deprecated Use TriPocRow instead */
export const DualPocRow = TriPocRow;

function PocCircle({
  poc,
  label,
  badgeBg,
  size,
  badgeSize,
  showName,
  title,
}: {
  poc: Poc;
  label: string;
  badgeBg: string;
  size: string;
  badgeSize: string;
  showName: boolean;
  title: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" title={`${title} POC · ${poc.name}`}>
      <span className="relative shrink-0">
        <span
          className={cn(
            "rounded-full inline-flex items-center justify-center font-semibold",
            size,
            poc.color,
          )}
        >
          {poc.initials}
        </span>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full inline-flex items-center justify-center font-bold text-white ring-1 ring-white",
            badgeSize,
            badgeBg,
          )}
        >
          {label}
        </span>
      </span>
      {showName && (
        <span className="text-[11.5px] text-n700 truncate">
          <span className="text-n800 font-medium">{poc.name.split(" ")[0]}</span>
        </span>
      )}
    </span>
  );
}
