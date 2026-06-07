import { useParams, Link } from "react-router-dom";
import { useStudentById, useStudentLmpLinks, useLmpProcessesByIds } from "@/lib/hooks/useDbData";
import { useResolveDomain } from "@/lib/hooks/useResolveDomain";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, Briefcase } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";

function deriveProgram(rollNo: string): "TBM" | "YLC" | "" {
  if (rollNo?.startsWith("YLC")) return "YLC";
  if (rollNo?.startsWith("PGP")) return "TBM";
  return "";
}

function deriveCohortYear(rollNo: string): string {
  const m = rollNo?.match(/^(?:PGP|YLC)(\d{4})/);
  return m ? m[1] : "";
}

export default function StudentDetailPage() {
  const { rollNo } = useParams<{ rollNo: string }>();
  const { data: student, isLoading } = useStudentById(decodeURIComponent(rollNo ?? ""));
  const { display: domainDisplay } = useResolveDomain();
  const s = student as any;

  const { data: lmpLinks = [] } = useStudentLmpLinks(s?.name);
  const lmpIds = useMemo(() => (lmpLinks as any[]).map((l: any) => l.lmp_id).filter(Boolean), [lmpLinks]);
  const { data: linkedLmps = [] } = useLmpProcessesByIds(lmpIds);

  // Realtime: refresh when this student row, candidate links, or related LMPs change.
  useRealtimeInvalidate("students", [["db-student", decodeURIComponent(rollNo ?? "")], ["db-students"]], { enabled: !!rollNo });
  useRealtimeInvalidate("lmp_candidates", [["db-student-lmp-links"]]);
  useRealtimeInvalidate("lmp_processes", [["db-lmp-processes"]]);

  if (isLoading) return <div className="space-y-4 p-8">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (!student) return <div className="p-8 text-center text-muted-foreground">Student not found.</div>;

  const prog = deriveProgram(s.roll_no || "");
  const year = deriveCohortYear(s.roll_no || "");

  const lmpStatusColor = (status: string) => {
    const st = (status || "").toLowerCase();
    if (st === "converted") return "bg-emerald-50 text-emerald-700";
    if (st === "ongoing" || st === "not started") return "bg-blue-50 text-blue-700";
    if (st === "dormant") return "bg-muted text-muted-foreground";
    if (st === "offer received") return "bg-teal-50 text-teal-700";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/data-sources?tab=sources" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Students
      </Link>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-5">
        {/* Header card */}
        <div className="rounded-2xl border bg-card shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className={`h-14 w-14 rounded-xl flex items-center justify-center shrink-0 ${prog === "YLC" ? "bg-teal-50" : "bg-orange-50"}`}>
              <User className={`h-7 w-7 ${prog === "YLC" ? "text-teal-500" : "text-orange-500"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[24px] font-bold text-foreground tracking-[-0.5px]">{s.name}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-[11px] font-mono">{s.roll_no}</Badge>
                {prog && (
                  <Badge variant="outline" className={`text-[11px] ${
                    prog === "YLC" ? "border-teal-200 text-teal-700 bg-teal-50" : "border-orange-200 text-orange-700 bg-orange-50"
                  }`}>
                    {prog}
                  </Badge>
                )}
                {year && <Badge variant="outline" className="text-[11px]">{year}</Badge>}
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="rounded-2xl border bg-card shadow-sm p-5">
          <h3 className="text-[11px] uppercase tracking-[1px] font-semibold text-muted-foreground mb-4">Student Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              { label: "Roll No.", value: s.roll_no },
              { label: "Program", value: prog || "—" },
              { label: "Cohort Year", value: year || "—" },
              { label: "Primary Domain", value: s.primary_domain ? domainDisplay(s.primary_domain) : "" },
              { label: "Secondary Domain", value: s.secondary_domain ? domainDisplay(s.secondary_domain) : "" },
              { label: "Email", value: s.email },
            ].map((f) => (
              <div key={f.label} className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                <span className="text-[11px] text-muted-foreground font-medium">{f.label}</span>
                <span className="text-[12px] text-foreground font-medium text-right max-w-[55%] truncate">{f.value || "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* LMP Connections */}
        {(linkedLmps as any[]).length > 0 && (
          <div className="rounded-2xl border bg-card shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-[11px] uppercase tracking-[1px] font-semibold text-muted-foreground">
                Linked LMP Processes ({(linkedLmps as any[]).length})
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(linkedLmps as any[]).map((lmp: any) => {
                const candidateLink = (lmpLinks as any[]).find((l: any) => l.lmp_id === lmp.id);
                return (
                  <Link
                    key={lmp.id}
                    to={`/lmp/${lmp.id}`}
                    className="rounded-xl border bg-muted/20 p-3.5 hover:border-orange-200 transition-colors block"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-foreground truncate">{lmp.company}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{lmp.role}</div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${lmpStatusColor(lmp.status)}`}>
                        {lmp.status}
                      </Badge>
                    </div>
                    {candidateLink?.pipeline_stage && (
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        Stage: <span className="font-medium text-foreground">{candidateLink.pipeline_stage}</span>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
