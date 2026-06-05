import { useMemo, useState } from "react";
import { Search, X, ExternalLink, GraduationCap, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAllAlumni } from "@/lib/hooks/useDbData";
import { useResolveDomain } from "@/lib/hooks/useResolveDomain";
import { EmptyState } from "@/components/ui/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const PAGE_SIZE = 50;

export function AlumniViewAllModal({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: alumni = [], isLoading } = useAllAlumni();
  const { names: domainOptions, display: domainDisplay, matches: domainMatches } = useResolveDomain();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [cohort, setCohort] = useState("");
  const [industry, setIndustry] = useState("");
  const [domain, setDomain] = useState("");
  const [company, setCompany] = useState("");
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("alumni_records").delete().not("id", "is", null);
      if (error) throw error;
      await supabase.from("mentors").delete().eq("sync_source", "alumni_mirror");
      await supabase.rpc("refresh_data_source_status", { _source: "alumni_db" });
      try {
        await supabase.from("activity_log").insert({
          actor_name: "Admin", entity_type: "alumni_db",
          action: "alumni_db_wipe", source: "ui",
          metadata: { count: alumni.length },
        });
      } catch { /* non-fatal */ }
      await qc.invalidateQueries();
      toast.success(`Deleted ${alumni.length} alumni records`);
      setConfirmOpen(false);
      setConfirmText("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete alumni");
    } finally {
      setDeleting(false);
    }
  };

  const cohorts = useMemo(() => Array.from(new Set(alumni.map((a: any) => a.cohort).filter(Boolean))) as string[], [alumni]);
  const industries = useMemo(() => Array.from(new Set(alumni.map((a: any) => a.industry).filter(Boolean))) as string[], [alumni]);
  const domains = domainOptions;
  const companies = useMemo(() => Array.from(new Set(alumni.map((a: any) => a.current_company).filter(Boolean))) as string[], [alumni]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return alumni.filter((a: any) => {
      if (cohort && a.cohort !== cohort) return false;
      if (industry && a.industry !== industry) return false;
      if (domain && !domainMatches(a.domain_1, domain) && !domainMatches(a.domain_2, domain)) return false;
      if (company && a.current_company !== company) return false;
      if (!q) return true;
      return [a.student_name, a.current_company, a.current_role_title, a.industry, a.domain_1, a.domain_2, a.cohort]
        .filter(Boolean).some((v: string) => v.toLowerCase().includes(q));
    });
  }, [alumni, search, cohort, industry, domain, company, domainMatches]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1100px] max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-n200 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-[16px] font-semibold text-n900">All Alumni</DialogTitle>
              <p className="text-[12px] text-n500 mt-0.5">
                Showing {filtered.length} of {alumni.length} alumni
              </p>
            </div>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={alumni.length === 0 || deleting}
              className="mr-8 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-red-200 text-red-600 hover:bg-red-50 text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete All
            </button>
          </div>
        </DialogHeader>

        <div className="px-6 py-3 border-b border-n200 shrink-0 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-n400" />
            <input
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, company, role, industry, domain…"
              className="w-full h-8 rounded-md border border-n300 bg-card pl-8 pr-8 text-[13px] focus:outline-none focus:border-orange-400"
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-n400 hover:text-n700"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <FilterSelect value={cohort} onChange={(v) => { setCohort(v); setPage(1); }} options={cohorts} placeholder="Cohort" />
          <FilterSelect value={industry} onChange={(v) => { setIndustry(v); setPage(1); }} options={industries} placeholder="Industry" />
          <FilterSelect value={domain} onChange={(v) => { setDomain(v); setPage(1); }} options={domains} placeholder="Domain" />
          <FilterSelect value={company} onChange={(v) => { setCompany(v); setPage(1); }} options={companies} placeholder="Current Company" />
        </div>

        <div className="flex-1 overflow-auto px-6 py-3">
          {isLoading ? (
            <div className="text-center text-n500 py-12 text-[13px]">Loading…</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={GraduationCap} title="No alumni found" description="Try clearing filters or upload a CSV." />
          ) : (
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-left text-n500 text-[10px] uppercase tracking-[0.5px] border-b border-n200">
                  <th className="font-medium px-2 py-2">Student Name</th>
                  <th className="font-medium px-2 py-2">Cohort</th>
                  <th className="font-medium px-2 py-2">LinkedIn</th>
                  <th className="font-medium px-2 py-2">Industry</th>
                  <th className="font-medium px-2 py-2">Domain 1</th>
                  <th className="font-medium px-2 py-2">Domain 2</th>
                  <th className="font-medium px-2 py-2">City</th>
                  <th className="font-medium px-2 py-2">State</th>
                  <th className="font-medium px-2 py-2">Location</th>
                  <th className="font-medium px-2 py-2">Current Company</th>
                  <th className="font-medium px-2 py-2">Current Role</th>
                  <th className="font-medium px-2 py-2">Company 2</th>
                  <th className="font-medium px-2 py-2">Role 2</th>
                  <th className="font-medium px-2 py-2">Company 3</th>
                  <th className="font-medium px-2 py-2">Company 4</th>
                  <th className="font-medium px-2 py-2">Role 4</th>
                  <th className="font-medium px-2 py-2">Company 5</th>
                  <th className="font-medium px-2 py-2">Role 5</th>
                  <th className="font-medium px-2 py-2">Company 6</th>
                  <th className="font-medium px-2 py-2">Role 6</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a: any) => (
                  <tr key={a.id} className="border-b border-n100 hover:bg-n50/50">
                    <td className="px-2 py-2 text-n900 font-medium">{a.student_name}</td>
                    <td className="px-2 py-2 text-n600">{a.cohort || "—"}</td>
                    <td className="px-2 py-2">
                      {a.linkedin_profile ? (
                        <a href={a.linkedin_profile.startsWith("http") ? a.linkedin_profile : `https://${a.linkedin_profile}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-sky-600 hover:underline inline-flex items-center"><ExternalLink className="h-3 w-3" /></a>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-2 text-n600">{a.industry || "—"}</td>
                    <td className="px-2 py-2 text-n600">{domainDisplay(a.domain_1)}</td>
                    <td className="px-2 py-2 text-n600">{domainDisplay(a.domain_2)}</td>
                    <td className="px-2 py-2 text-n600">{a.current_city || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.current_state || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.location || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.current_company || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.current_role_title || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.company_2 || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.role_2 || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.company_3 || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.company_4 || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.role_4 || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.company_5 || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.role_5 || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.company_6 || "—"}</td>
                    <td className="px-2 py-2 text-n600">{a.role_6 || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="px-6 py-3 border-t border-n200 flex items-center justify-between text-[12px]">
            <span className="text-n500">Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-2 py-1 rounded-md border border-n300 disabled:opacity-40">Prev</button>
              <button disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-2 py-1 rounded-md border border-n300 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={(v) => { setConfirmOpen(v); if (!v) setConfirmText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all alumni?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {alumni.length} alumni records and remove
              alumni-mirrored mentors from the Mentor Union. This cannot be undone.
              <br /><br />
              Type <span className="font-mono font-semibold text-red-600">DELETE</span> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="w-full h-9 rounded-md border border-n300 px-3 text-[13px] focus:outline-none focus:border-red-400"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteAll(); }}
              disabled={confirmText !== "DELETE" || deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Deleting…" : `Delete ${alumni.length} records`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
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
