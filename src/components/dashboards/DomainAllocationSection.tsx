import { useMemo } from "react";
import {
  LxGrid, LxCard, LxCardHeader, LxSection, LX_HEX,
} from "@/components/insights/primitives";
import {
  domainAllocation, pocPurityMatrix,
} from "@/lib/domainAllocation";
import { usePocPrimaryDomainMap } from "@/lib/hooks/usePocPrimaryDomainMap";
import type { Process } from "@/lib/lmpProcessQueries";

type Props = {
  rows: Process[];
  pocName?: string;
};

export function DomainAllocationSection({ rows, pocName }: Props) {
  const { map } = usePocPrimaryDomainMap();
  const alloc = useMemo(() => domainAllocation(rows, map).filter((d) => d.total > 0), [rows, map]);
  const purity = useMemo(() => pocPurityMatrix(rows, map), [rows, map]);

  const IN = LX_HEX.success;
  const CR = LX_HEX.orange;

  const personal = !!pocName;
  const matrixRows = personal ? purity.filter((p) => p.poc === pocName) : purity.slice(0, 10);

  return (
    <>
      <LxSection
        eyebrow="Allocation"
        title={personal ? "My Domain Allocation" : "Domain Allocation Intelligence"}
        hint={
          personal
            ? "Volume split across domains — in-domain vs cross-domain."
            : "Are POCs working inside their expertise — and is cross-domain hurting conversion?"
        }
      />

      {/* Volume card */}
      <LxGrid>
        <LxCard span={12}>
          <LxCardHeader eyebrow="Volume" title="LMP split per domain" />
          <ul className="space-y-2">
            {alloc.map((d) => (
              <li key={d.domain} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
                  style={{ background: "var(--lx-soft)" }}>
                <span className="text-[12px] truncate" style={{ color: "var(--lx-text)" }}>{d.domain}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Chip label={`${d.total} total`} />
                  <Chip label={`${d.inDomain} in`} color={IN} />
                  <Chip label={`${d.cross} cross`} color={CR} />
                </div>
              </li>
            ))}
          </ul>
        </LxCard>
      </LxGrid>

      {/* Purity matrix */}
      <LxGrid>
        <LxCard span={12}>
          <LxCardHeader
            eyebrow="People · purity"
            title={personal ? "My purity row" : "POC Domain Purity Matrix"}
            hint={personal ? "Your in-domain vs cross-domain split and outcomes." : "Who is stretched outside their domain — and who handles cross-domain well."}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left" style={{ color: "var(--lx-text-3)" }}>
                  <th className="px-2 py-2 font-medium">POC</th>
                  <th className="px-2 py-2 font-medium">Primary domain</th>
                  <th className="px-2 py-2 font-medium text-right">In-domain LMPs</th>
                  <th className="px-2 py-2 font-medium text-right">Cross-domain LMPs</th>
                  <th className="px-2 py-2 font-medium text-right">In-domain conv %</th>
                  <th className="px-2 py-2 font-medium text-right">Cross conv %</th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-2 py-4 text-center" style={{ color: "var(--lx-text-3)" }}>No data</td></tr>
                ) : matrixRows.map((p) => (
                  <tr key={p.poc} style={{ borderTop: "1px solid var(--lx-soft)" }}>
                    <td className="px-2 py-2" style={{ color: "var(--lx-text)" }}>{p.poc}</td>
                    <td className="px-2 py-2" style={{ color: "var(--lx-text-2)" }}>{p.primaryDomain}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums"><span style={{ color: IN }}>{p.inDomainCount}</span></td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums"><span style={{ color: CR }}>{p.crossCount}</span></td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums" style={{ color: "var(--lx-text)" }}>{p.inDomainCount ? `${p.inDomainConvPct}%` : "—"}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums" style={{ color: "var(--lx-text)" }}>{p.crossCount ? `${p.crossConvPct}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </LxCard>
      </LxGrid>
    </>
  );
}

function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10.5px] font-mono tabular-nums"
      style={{
        background: color ? `${color}1A` : "var(--lx-soft-2, var(--lx-soft))",
        color: color ?? "var(--lx-text-2)",
        border: `1px solid ${color ? `${color}40` : "transparent"}`,
      }}
    >
      {label}
    </span>
  );
}
