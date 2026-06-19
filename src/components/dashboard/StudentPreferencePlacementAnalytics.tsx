import { useState } from "react";
import { Download } from "lucide-react";
import { LX_HEX } from "@/components/insights/primitives";
import type { DomainPreferenceRowWithDrill, StudentRosterEntry } from "@/lib/analytics/studentPreferencePlacement";
import type { PocMovementRow } from "@/lib/studentAnalytics";
import type { LmpRecord } from "@/lib/lmpTypes";

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function StudentPreferencePlacementAnalytics({
  domainPrefData,
  pocLensData,
  lmpRecords,
  onStudentDrill,
  onLmpDrill,
}: {
  domainPrefData: DomainPreferenceRowWithDrill[];
  pocLensData: PocMovementRow[];
  lmpRecords: LmpRecord[];
  onStudentDrill?: (title: string, rows: StudentRosterEntry[]) => void;
  onLmpDrill?: (title: string, rows: LmpRecord[]) => void;
}) {
  const [lensMode, setLensMode] = useState<"domain" | "poc">("domain");

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-start justify-between gap-3 mb-3 shrink-0">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight" style={{ color: "var(--lx-text)" }}>
            {lensMode === "domain" ? "Student preference vs placement outcome" : "POC lens — student funnel"}
          </h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--lx-text-2)" }}>
            {lensMode === "domain"
              ? "Primary and secondary domain preferences vs LMP engagement and conversion."
              : "How each Prep POC's LMPs move students through the placement funnel."}
          </p>
        </div>
        <div
          className="inline-flex rounded-md p-0.5 shrink-0"
          style={{ background: "var(--lx-soft)", border: "0.5px solid var(--lx-border)" }}
        >
          {(["domain", "poc"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setLensMode(m)}
              className="px-2.5 h-7 text-[11.5px] font-medium rounded-[5px] transition-colors"
              style={{
                background: lensMode === m ? "var(--lx-surface)" : "transparent",
                color: lensMode === m ? LX_HEX.orange : "var(--lx-text-3)",
                boxShadow: lensMode === m ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              }}
            >
              {m === "domain" ? "Domain lens" : "POC lens"}
            </button>
          ))}
        </div>
      </div>

      {lensMode === "domain" ? (
        domainPrefData.length === 0 ? (
          <div className="py-8 text-center text-[12px]" style={{ color: "var(--lx-text-3)" }}>
            No domain preference data yet.
          </div>
        ) : (
          <>
            <div className="flex justify-end mb-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const h = ["Domain", "Primary Interested", "Primary Converted", "Primary Fulfilled %", "Secondary Interested", "Secondary Converted", "Secondary Fulfilled %", "Total Unique Interested", "Currently In Domain Process", "Total Converted", "Interest-to-Placement %"];
                  const body = domainPrefData.map((r) => [
                    r.domain, r.primaryInterested, r.primaryConverted,
                    r.primaryFulfilledPct != null ? r.primaryFulfilledPct.toFixed(1) : "",
                    r.secondaryInterested, r.secondaryConverted,
                    r.secondaryFulfilledPct != null ? r.secondaryFulfilledPct.toFixed(1) : "",
                    r.totalUniqueInterested, r.currentlyInDomainProcess,
                    r.totalConverted,
                    r.interestToPlacementPct != null ? r.interestToPlacementPct.toFixed(1) : "",
                  ].map(csvEscape).join(",")).join("\n");
                  downloadCsv("domain-preference-outcome.csv", `${h.map(csvEscape).join(",")}\n${body}`);
                }}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] border hover:bg-[var(--lx-soft)] transition-colors"
                style={{ borderColor: "var(--lx-border)", color: "var(--lx-text-3)" }}
              >
                <Download size={11} /> Export CSV
              </button>
            </div>
            <div className="overflow-auto flex-1 min-h-0 border rounded-md" style={{ borderColor: "var(--lx-border)" }}>
              <table className="text-[11.5px] border-collapse w-full" style={{ minWidth: 900 }}>
                <thead className="sticky top-0 z-[3]" style={{ background: "var(--lx-surface)" }}>
                  <tr style={{ borderBottom: "1px solid var(--lx-border)" }}>
                    <th className="sticky left-0 z-[4] px-3 pb-1 pt-2 text-left text-[10px] uppercase tracking-[0.5px] font-medium"
                      style={{ color: "var(--lx-text-3)", background: "var(--lx-surface)", minWidth: 140 }} rowSpan={2}>
                      Domain
                    </th>
                    <th colSpan={3} className="px-3 pb-1 pt-2 text-center text-[10px] uppercase tracking-[0.5px] font-semibold border-l"
                      style={{ color: LX_HEX.info, borderColor: "var(--lx-border)" }}>Demand</th>
                    <th colSpan={3} className="px-3 pb-1 pt-2 text-center text-[10px] uppercase tracking-[0.5px] font-semibold border-l"
                      style={{ color: LX_HEX.success, borderColor: "var(--lx-border)" }}>Fulfilment</th>
                    <th colSpan={4} className="px-3 pb-1 pt-2 text-center text-[10px] uppercase tracking-[0.5px] font-semibold border-l"
                      style={{ color: LX_HEX.ai, borderColor: "var(--lx-border)" }}>Coverage</th>
                  </tr>
                  <tr style={{ borderBottom: "2px solid var(--lx-border)" }}>
                    {[
                      { label: "Primary Interested", borderLeft: true },
                      { label: "Primary Converted" },
                      { label: "Primary Fulfilled %" },
                      { label: "Secondary Interested", borderLeft: true },
                      { label: "Secondary Converted" },
                      { label: "Secondary Fulfilled %" },
                      { label: "Total Unique Interested", borderLeft: true },
                      { label: "Currently In Domain Process" },
                      { label: "Total Converted" },
                      { label: "Interest-to-Placement %" },
                    ].map((h) => (
                      <th key={h.label}
                        className={`px-3 pb-2 pt-1 text-right font-medium text-[10px] uppercase tracking-[0.4px] whitespace-nowrap${h.borderLeft ? " border-l" : ""}`}
                        style={{ color: "var(--lx-text-3)", borderColor: "var(--lx-border)" }}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {domainPrefData
                    .sort((a, b) => b.totalUniqueInterested - a.totalUniqueInterested)
                    .map((r) => {
                      const pFulColor = r.primaryFulfilledPct == null ? "var(--lx-text-3)" : r.primaryFulfilledPct >= 50 ? LX_HEX.success : r.primaryFulfilledPct >= 20 ? LX_HEX.yellow : LX_HEX.risk;
                      const sFulColor = r.secondaryFulfilledPct == null ? "var(--lx-text-3)" : r.secondaryFulfilledPct >= 50 ? LX_HEX.success : r.secondaryFulfilledPct >= 20 ? LX_HEX.yellow : LX_HEX.risk;
                      const i2pColor = r.interestToPlacementPct == null ? "var(--lx-text-3)" : r.interestToPlacementPct >= 50 ? LX_HEX.success : r.interestToPlacementPct >= 20 ? LX_HEX.yellow : LX_HEX.risk;
                      const pill = (v: number | null, color: string) =>
                        v != null ? (
                          <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ background: `${color}18`, color }}>{v.toFixed(0)}%</span>
                        ) : <span style={{ color: "var(--lx-text-3)" }}>—</span>;
                      const numCell = (val: number, onClick: () => void, accent?: string) => (
                        <td className="px-3 py-2 text-right tabular-nums" style={{ borderBottom: "1px solid var(--lx-border)" }}>
                          {val > 0 && onStudentDrill ? (
                            <button type="button" onClick={onClick}
                              className="font-semibold rounded px-1 hover:underline"
                              style={{ color: accent ?? "var(--lx-text-2)" }}>{val}</button>
                          ) : <span style={{ color: "var(--lx-text-3)" }}>{val}</span>}
                        </td>
                      );
                      return (
                        <tr key={r.domain} className="hover:bg-[var(--lx-soft)] transition-colors">
                          <td className="sticky left-0 z-[1] px-3 py-2 font-medium" style={{ color: "var(--lx-text)", background: "var(--lx-surface)", minWidth: 140 }}>
                            {r.domain}
                          </td>
                          {numCell(r.primaryInterested, () => onStudentDrill?.(`${r.domain} · Primary Interested`, r.drillPrimaryInterested), LX_HEX.info)}
                          {numCell(r.primaryConverted, () => onStudentDrill?.(`${r.domain} · Primary Converted`, r.drillPrimaryConverted), LX_HEX.success)}
                          <td className="px-3 py-2 text-right" style={{ borderBottom: "1px solid var(--lx-border)" }}>{pill(r.primaryFulfilledPct, pFulColor)}</td>
                          {numCell(r.secondaryInterested, () => onStudentDrill?.(`${r.domain} · Secondary Interested`, r.drillSecondaryInterested), LX_HEX.info)}
                          {numCell(r.secondaryConverted, () => onStudentDrill?.(`${r.domain} · Secondary Converted`, r.drillSecondaryConverted), LX_HEX.success)}
                          <td className="px-3 py-2 text-right" style={{ borderBottom: "1px solid var(--lx-border)" }}>{pill(r.secondaryFulfilledPct, sFulColor)}</td>
                          {numCell(r.totalUniqueInterested, () => onStudentDrill?.(`${r.domain} · All Interested`, [...r.drillPrimaryInterested, ...r.drillSecondaryInterested].filter((s, i, arr) => arr.findIndex((x) => x.name === s.name) === i)), "var(--lx-text)")}
                          {numCell(r.currentlyInDomainProcess, () => onStudentDrill?.(`${r.domain} · Currently In Process`, r.drillInProcess), LX_HEX.info)}
                          {numCell(r.totalConverted, () => onStudentDrill?.(`${r.domain} · Total Converted`, r.drillTotalConverted), LX_HEX.success)}
                          <td className="px-3 py-2 text-right font-semibold" style={{ borderBottom: "1px solid var(--lx-border)" }}>{pill(r.interestToPlacementPct, i2pColor)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : pocLensData.length === 0 ? (
        <div className="py-8 text-center text-[12px]" style={{ color: "var(--lx-text-3)" }}>
          No POC data in current scope.
        </div>
      ) : (
        <>
          <div className="flex justify-end mb-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const h = ["POC", "Role", "Active LMPs", "Unique Students", "R1", "R2", "R3", "Offers", "Converted", "Conversion %"];
                const body = pocLensData.map((p) => [
                  p.pocName, p.role, p.activeLmps, p.uniqueStudents,
                  p.r1, p.r2, p.r3, p.offers, p.converted,
                  p.convPct != null ? p.convPct.toFixed(1) : "",
                ].map(csvEscape).join(",")).join("\n");
                downloadCsv("poc-lens.csv", `${h.map(csvEscape).join(",")}\n${body}`);
              }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] border hover:bg-[var(--lx-soft)] transition-colors"
              style={{ borderColor: "var(--lx-border)", color: "var(--lx-text-3)" }}
            >
              <Download size={11} /> Export CSV
            </button>
          </div>
          <div className="overflow-auto flex-1 min-h-0 border rounded-md" style={{ borderColor: "var(--lx-border)" }}>
            <table className="w-full text-[11.5px] border-collapse">
              <thead className="sticky top-0" style={{ background: "var(--lx-surface)" }}>
                <tr style={{ borderBottom: "2px solid var(--lx-border)" }}>
                  {["POC", "Role", "Active LMPs", "Unique Students", "R1", "R2", "R3", "Offers", "Converted", "Conversion %"].map((label, i) => (
                    <th key={label}
                      className={`pb-2 pt-1 font-medium text-[10px] uppercase tracking-[0.5px] whitespace-nowrap px-3 ${i >= 2 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--lx-text-3)" }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pocLensData.map((p) => {
                  const convColor = p.convPct == null ? "var(--lx-text-3)" : p.convPct >= 50 ? LX_HEX.success : p.convPct >= 20 ? LX_HEX.yellow : LX_HEX.risk;
                  const roleAccent: Record<string, string> = { Prep: LX_HEX.info, Outreach: LX_HEX.teal, Support: LX_HEX.ai };
                  const openPocLmps = () => {
                    const lmps = lmpRecords.filter((r) => {
                      if (p.role === "Prep") return r.prepPoc?.name === p.pocName;
                      if (p.role === "Support") return r.supportPoc?.name === p.pocName;
                      return false;
                    });
                    onLmpDrill?.(`${p.pocName} (${p.role}) · LMPs`, lmps);
                  };
                  return (
                    <tr key={p.pocKey} className="border-b hover:bg-[var(--lx-soft)] transition-colors" style={{ borderColor: "var(--lx-border)" }}>
                      <td className="py-2 px-3 font-medium" style={{ color: "var(--lx-text)" }}>
                        {onLmpDrill ? (
                          <button type="button" onClick={openPocLmps} className="hover:underline text-left">{p.pocName || "—"}</button>
                        ) : (p.pocName || "—")}
                      </td>
                      <td className="py-2 px-3">
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: `${roleAccent[p.role] ?? LX_HEX.info}18`, color: roleAccent[p.role] ?? LX_HEX.info }}>
                          {p.role}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {onLmpDrill ? (
                          <button type="button" onClick={openPocLmps} className="hover:underline" style={{ color: "var(--lx-text-2)" }}>{p.activeLmps}</button>
                        ) : p.activeLmps}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold" style={{ color: "var(--lx-text)" }}>{p.uniqueStudents}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: "var(--lx-text-2)" }}>{p.r1}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: "var(--lx-text-2)" }}>{p.r2}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: "var(--lx-text-2)" }}>{p.r3}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: LX_HEX.yellow }}>{p.offers}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold" style={{ color: LX_HEX.success }}>{p.converted}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold">
                        {p.convPct != null ? (
                          <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px]"
                            style={{ background: `${convColor}18`, color: convColor }}>
                            {p.convPct.toFixed(0)}%
                          </span>
                        ) : <span style={{ color: "var(--lx-text-3)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
