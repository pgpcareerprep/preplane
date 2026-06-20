import { useMemo, useState } from "react";
import { Search, X, ExternalLink } from "lucide-react";
import { DataSourceViewDrawer } from "./DataSourceViewDrawer";
import { useAllMentors } from "@/lib/hooks/useDbData";
import { useResolveDomain } from "@/lib/hooks/useResolveDomain";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { ClearDataSourceButton } from "./ClearDataSourceButton";

const PAGE_SIZE = 50;

export function ViewAllMentorsModal({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: mentors = [], isLoading } = useAllMentors();
  const { names: canonicalDomainNames, display: domainDisplay, matches: domainMatches } = useResolveDomain();
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [seniority, setSeniority] = useState("");
  const [page, setPage] = useState(1);

  const muMentors = useMemo(() => mentors.filter(m => m.source === "MU"), [mentors]);

  const domains = canonicalDomainNames;
  const industries = useMemo(() => Array.from(new Set(muMentors.map(m => m.industry).filter(Boolean))) as string[], [muMentors]);
  const seniorities = useMemo(() => Array.from(new Set(muMentors.map(m => m.seniority).filter(Boolean))) as string[], [muMentors]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return muMentors.filter(m => {
      if (domain && !domainMatches(m.functional_domain, domain)) return false;
      if (industry && m.industry !== industry) return false;
      if (seniority && m.seniority !== seniority) return false;
      if (!q) return true;
      return (m.name || "").toLowerCase().includes(q) ||
        (m.company || "").toLowerCase().includes(q) ||
        (m.designation || "").toLowerCase().includes(q) ||
        (m.functional_domain || "").toLowerCase().includes(q) ||
        (m.industry || "").toLowerCase().includes(q) ||
        (m.skill_tags || []).some(s => s.toLowerCase().includes(q));
    });
  }, [muMentors, search, domain, industry, seniority, domainMatches]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <DataSourceViewDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="All Mentor Union mentors"
      subtitle={`Showing ${filtered.length} of ${muMentors.length} mentors`}
      headerExtra={
        <ClearDataSourceButton
          source="mentor_union"
          label="mentors"
          count={mentors.length}
          onCleared={() => onOpenChange(false)}
        />
      }
      footer={
        filtered.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between px-6 py-3 text-[12px]">
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-2 py-1 rounded-md border border-border disabled:opacity-40">Prev</button>
              <button disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-2 py-1 rounded-md border border-border disabled:opacity-40">Next</button>
            </div>
          </div>
        ) : undefined
      }
    >
        <div className="px-6 py-3 border-b border-border shrink-0 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-n400" />
            <input
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, company, designation, domain, expertise…"
              className="w-full h-8 rounded-md border border-n300 bg-card pl-8 pr-8 text-[13px] focus:outline-none focus:border-orange-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-n400 hover:text-n700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <FilterSelect value={domain} onChange={(v) => { setDomain(v); setPage(1); }} options={domains} placeholder="Functional Domain" />
          <FilterSelect value={industry} onChange={(v) => { setIndustry(v); setPage(1); }} options={industries} placeholder="Industry" />
          <FilterSelect value={seniority} onChange={(v) => { setSeniority(v); setPage(1); }} options={seniorities} placeholder="Mentor Type" />
        </div>

        <div className="flex-1 overflow-auto px-6 py-3">
          {isLoading ? (
            <div className="text-center text-n500 py-12 text-[13px]">Loading…</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Users} title="No mentors found" description="Try clearing filters or upload a CSV." />
          ) : (
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-left text-muted-foreground text-[10px] uppercase tracking-[0.5px] border-b border-border">
                  <th className="font-medium px-2 py-2">Mentor Type</th>
                  <th className="font-medium px-2 py-2">Name</th>
                  <th className="font-medium px-2 py-2 text-right">Years of Exp</th>
                  <th className="font-medium px-2 py-2">Designation</th>
                  <th className="font-medium px-2 py-2">Company</th>
                  <th className="font-medium px-2 py-2">LinkedIn</th>
                  <th className="font-medium px-2 py-2">Email</th>
                  <th className="font-medium px-2 py-2">Mobile Number</th>
                  <th className="font-medium px-2 py-2">Functional Domain</th>
                  <th className="font-medium px-2 py-2">Industry</th>
                  <th className="font-medium px-2 py-2">Expertise</th>
                  <th className="font-medium px-2 py-2 text-right">Ratings</th>
                  <th className="font-medium px-2 py-2 text-right">Rate</th>
                  <th className="font-medium px-2 py-2">Currency</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(m => (
                  <tr key={m.id} className="border-b border-border hover:bg-muted/40">
                    <td className="px-2 py-2 text-muted-foreground">{m.seniority || "—"}</td>
                    <td className="px-2 py-2 text-foreground font-medium">{m.name}</td>
                    <td className="px-2 py-2 text-right text-foreground tabular-nums">{(m as any).years_of_experience ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{m.designation || "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{m.company || "—"}</td>
                    <td className="px-2 py-2">
                      {m.linkedin ? (
                        <a href={m.linkedin.startsWith("http") ? m.linkedin : `https://${m.linkedin}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-sky-600 hover:underline inline-flex items-center"><ExternalLink className="h-3 w-3" /></a>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{m.email || "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{m.phone || "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{domainDisplay(m.functional_domain)}</td>
                    <td className="px-2 py-2 text-muted-foreground">{m.industry || "—"}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {(m.skill_tags || []).slice(0, 4).map(s => (
                          <span key={s} className="text-[10px] uppercase tracking-[0.5px] font-medium bg-muted text-muted-foreground border border-border rounded-full px-1.5 py-[1px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-n700 tabular-nums">{m.rating ? `${m.rating}` : "—"}</td>
                    <td className="px-2 py-2 text-right text-n700 tabular-nums">{m.rate ? `${m.rate}` : "—"}</td>
                    <td className="px-2 py-2 text-n600">{(m as any).currency || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
    </DataSourceViewDrawer>
  );
}

function FilterSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-n300 bg-card px-2 text-[12px] text-n700 focus:outline-none focus:border-orange-400">
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
