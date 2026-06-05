import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type LmpRecord, HEALTH_META, slaChip, STATUS_META } from "@/lib/lmpTypes";

type SortKey = "role" | "candidates" | "status" | "slaDays";

export function LmpTable({ records }: { records: LmpRecord[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "slaDays", dir: "desc" });

  const sorted = useMemo(() => {
    const arr = [...records];
    arr.sort((a, b) => {
      const av = (a as any)[sort.key];
      const bv = (b as any)[sort.key];
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [records, sort]);

  const toggle = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

  return (
    <div className="rounded-2xl bg-card border border-n200 shadow-sm overflow-hidden">
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-n50 text-n500 text-[11px] uppercase tracking-[0.5px] z-10">
            <tr>
              <Th onClick={() => toggle("role")}       active={sort.key === "role"}       dir={sort.dir}>Role @ Company</Th>
              <Th>Domain</Th>
              <Th>POC(s)</Th>
              <Th onClick={() => toggle("candidates")} active={sort.key === "candidates"} dir={sort.dir}># Cand.</Th>
              <Th>Current Stage</Th>
              <Th onClick={() => toggle("status")}     active={sort.key === "status"}     dir={sort.dir}>Status</Th>
              <Th>Health</Th>
              <Th onClick={() => toggle("slaDays")}    active={sort.key === "slaDays"}    dir={sort.dir}>SLA</Th>
              <Th>Last Activity</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const sla = slaChip(r.slaDays);
              const sm = STATUS_META[r.status];
              const hm = HEALTH_META[r.health];
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t border-n100 transition-colors hover:bg-orange-50",
                    i % 2 === 1 && "bg-n50",
                  )}
                  style={{ height: 52 }}
                >
                  <Td className="font-semibold text-n900 whitespace-nowrap">
                    {r.company && <>{r.company}<span className="text-n400 font-normal"> — </span></>}{r.role || <span className="text-n400 italic font-normal">No role</span>}
                  </Td>
                  <Td>{r.domain}</Td>
                  <Td>
                    <div className="flex -space-x-1">
                      {r.pocs.slice(0, 3).map((p) => (
                        <div key={p.name} title={p.name}
                          className={cn("h-6 w-6 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-semibold", p.color)}>
                          {p.initials}
                        </div>
                      ))}
                    </div>
                  </Td>
                  <Td className="tabular-nums">{r.candidates}</Td>
                  <Td className="text-n700">{r.stage}</Td>
                  <Td>
                    <span className={cn("pill", sm.pill)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", sm.dot)} />
                      {sm.label}
                    </span>
                  </Td>
                  <Td>
                    <span className={cn("inline-flex items-center gap-1.5", hm.text)}>
                      <span className={cn("h-2 w-2 rounded-full", hm.dot)} /> {r.health}
                    </span>
                  </Td>
                  <Td>
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums", sla.cls)}>
                      {sla.label}
                    </span>
                  </Td>
                  <Td className="text-n500 whitespace-nowrap text-[12px]">{r.lastActivity}</Td>
                  <Td>
                    <Link
                      to={`/lmp/${encodeURIComponent(r.id)}`}
                      className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-500 font-medium"
                    >
                      View <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={10} className="text-center text-[13px] text-n500 py-12">No LMP records match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children, onClick, active, dir,
}: { children?: React.ReactNode; onClick?: () => void; active?: boolean; dir?: "asc" | "desc" }) {
  return (
    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">
      {onClick ? (
        <button
          onClick={onClick}
          className={cn("inline-flex items-center gap-1 hover:text-n800 transition-colors", active && "text-n800")}
        >
          {children}
          {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      ) : children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 text-n700 align-middle", className)}>{children}</td>;
}