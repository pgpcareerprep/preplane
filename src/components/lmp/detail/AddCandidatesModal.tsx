import { useMemo, useRef, useState } from "react";
import { Search, Upload, X, Check, FileText, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useStudents } from "@/lib/hooks/useDbData";
import { Badge } from "@/components/ui/badge";
import type { Candidate, Round } from "@/lib/lmpProcessMutations";
import { DEFAULT_ROUNDS } from "@/lib/lmpProcessMutations";

type Tab = "select" | "upload";
type ProgramFilter = "all" | "TBM" | "YLC";

function deriveProgram(rollNo: string): "TBM" | "YLC" | "" {
  if (rollNo?.startsWith("YLC")) return "YLC";
  if (rollNo?.startsWith("PGP")) return "TBM";
  return "";
}

function deriveCohortYear(rollNo: string): string {
  const m = rollNo?.match(/^(?:PGP|YLC)(\d{4})/);
  return m ? m[1] : "";
}

export function AddCandidatesModal({
  open,
  onOpenChange,
  existingIds,
  existingNames = [],
  onAdd,
  rounds,
  defaultRoundId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existingIds: string[];
  existingNames?: string[];
  onAdd: (candidates: Candidate[]) => void;
  rounds?: Round[];
  defaultRoundId?: string;
}) {
  const roundOptions: Round[] = (rounds && rounds.length > 0) ? rounds : DEFAULT_ROUNDS;
  const initialRoundId = defaultRoundId || "pool";
  const [tab, setTab] = useState<Tab>("select");
  const [program, setProgram] = useState<ProgramFilter>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [roundId, setRoundId] = useState<string>(initialRoundId);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: students = [], isLoading } = useStudents();
  const taken = useMemo(() => new Set(existingIds), [existingIds]);
  const takenNames = useMemo(
    () => new Set(existingNames.map((n) => n.trim().toLowerCase()).filter(Boolean)),
    [existingNames],
  );

  // Multi-token search: split by commas, semicolons, newlines, tabs, or 2+ spaces.
  // If none of those are present, also split single-space-separated words so users
  // can paste "abhir ayush vidhi aagrah" and get all matches at once.
  const tokens = useMemo(() => {
    const raw = query.trim();
    if (!raw) return [] as string[];
    const hasDelim = /[,;\n\t]|\s{2,}/.test(raw);
    const parts = hasDelim ? raw.split(/[,;\n\t]|\s{2,}/) : raw.split(/\s+/);
    const cleaned = parts.map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (cleaned.length > 1 && cleaned.every((t) => t.length < 2)) return [raw.toLowerCase()];
    return cleaned;
  }, [query]);

  const matchToken = (s: any, t: string) =>
    (s.name || "").toLowerCase().includes(t) ||
    (s.email || "").toLowerCase().includes(t) ||
    (s.roll_no || "").toLowerCase().includes(t);

  const filtered = useMemo(() => {
    return (students as any[])
      .filter((s) => {
        if (taken.has(s.id)) return false;
        const prog = deriveProgram(s.roll_no || "");
        if (program !== "all" && prog !== program) return false;
        if (tokens.length === 0) return true;
        return tokens.some((t) => matchToken(s, t));
      })
      .map((s) => ({
        s,
        firstIdx: tokens.length ? tokens.findIndex((t) => matchToken(s, t)) : -1,
      }))
      .sort((a, b) =>
        a.firstIdx !== b.firstIdx
          ? a.firstIdx - b.firstIdx
          : (a.s.name || "").localeCompare(b.s.name || ""),
      )
      .map((x) => x.s);
  }, [students, program, tokens, taken]);

  const unmatchedTokens = useMemo(() => {
    if (tokens.length < 2) return [] as string[];
    const pool = (students as any[]).filter((s) => !taken.has(s.id));
    return tokens.filter((t) => !pool.some((s) => matchToken(s, t)));
  }, [students, taken, tokens]);

  const hiddenCount = useMemo(
    () => (students as any[]).filter((s) => taken.has(s.id)).length,
    [students, taken],
  );

  const selectAllFiltered = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      filtered.forEach((s: any) => next.add(s.id));
      return next;
    });

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const reset = () => {
    setPicked(new Set());
    setFiles([]);
    setQuery("");
    setProgram("all");
    setTab("select");
    setRoundId(initialRoundId);
  };

  const handleFiles = (fl: FileList | null) => {
    if (!fl) return;
    const next = Array.from(fl).slice(0, 20 - files.length);
    setFiles((p) => [...p, ...next]);
  };

  const handleConfirm = () => {
    const fromDb: Candidate[] = (students as any[])
      .filter((s) => picked.has(s.id) && !taken.has(s.id))
      .map((s) => {
        const prog = deriveProgram(s.roll_no || "");
        const year = deriveCohortYear(s.roll_no || "");
        const initials = (s.name || "")
          .split(/\s+/)
          .slice(0, 2)
          .map((w: string) => w[0]?.toUpperCase() ?? "")
          .join("");
        return {
          id: s.id,
          studentId: s.id,
          name: s.name || "",
          initials: initials || "??",
          color: prog === "YLC" ? "bg-teal-200 text-teal-600" : "bg-orange-200 text-orange-600",
          cohort: [prog, year].filter(Boolean).join(" ") || "—",
          roundId,
        };
      });

    const fromUpload: Candidate[] = files
      .map((f, i) => {
        const base = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
        const name = base || `Candidate ${i + 1}`;
        const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "CV";
        return {
          id: `cv-${Date.now()}-${i}`,
          name,
          initials,
          color: "bg-n200 text-n700",
          cohort: "Uploaded CV",
          roundId,
        };
      })
      .filter((c) => !takenNames.has(c.name.trim().toLowerCase()));

    onAdd([...fromDb, ...fromUpload]);
    reset();
    onOpenChange(false);
  };

  const total = picked.size + files.length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-[16px] font-semibold text-foreground">Add Candidates</DialogTitle>
        </DialogHeader>

        <div className="px-5 border-b">
          <div className="flex items-center gap-1">
            {([
              { id: "select" as Tab, label: "Select Students", icon: Users },
              { id: "upload" as Tab, label: "Bulk Upload CVs", icon: Upload },
            ]).map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                    active ? "text-orange-600 border-orange-500" : "text-muted-foreground border-transparent hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Round selector — applies to both tabs */}
        <div className="px-5 pt-3 pb-1 flex flex-wrap items-center gap-2">
          <label className="text-[11px] uppercase tracking-[0.5px] font-semibold text-muted-foreground shrink-0">
            Add to round
          </label>
          <select
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-[12.5px] text-foreground focus:outline-none focus:border-orange-400"
          >
            <option value="pool">Pool — Newly added</option>
            {roundOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <span className="text-[11px] text-muted-foreground">
            New candidates will start in this round.
          </span>
        </div>

        {tab === "select" ? (
          <div className="px-5 py-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search — paste multiple names separated by commas or spaces…"
                  className="w-full h-9 rounded-md border bg-background pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-400"
                />
              </div>
              <div className="inline-flex rounded-md border overflow-hidden">
                {([
                  { id: "all" as ProgramFilter, label: "All" },
                  { id: "TBM" as ProgramFilter, label: "TBM" },
                  { id: "YLC" as ProgramFilter, label: "YLC" },
                ]).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setProgram(o.id)}
                    className={cn(
                      "px-3 h-9 text-[12px] font-medium transition-colors",
                      program === o.id ? "bg-orange-50 text-orange-600" : "bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {tokens.length > 1 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">
                  {filtered.length} match{filtered.length === 1 ? "" : "es"} across {tokens.length} names
                </span>
                {filtered.length > 0 && (
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-orange-600 hover:bg-orange-100 font-medium"
                  >
                    Select all {filtered.length}
                  </button>
                )}
                {unmatchedTokens.length > 0 && (
                  <span className="text-amber-700">
                    No match: {unmatchedTokens.join(", ")}
                  </span>
                )}
              </div>
            )}

            {hiddenCount > 0 && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                {hiddenCount} student{hiddenCount === 1 ? "" : "s"} already in this LMP {hiddenCount === 1 ? "is" : "are"} hidden.
              </div>
            )}


            {isLoading ? (
              <div className="mt-3 py-12 text-center text-[13px] text-muted-foreground">Loading students…</div>
            ) : (
              <>
                {/* Header row */}
                <div className="mt-3 grid grid-cols-[28px_32px_1fr_100px_100px_70px_60px] gap-2 items-center px-3 py-1.5 text-[10px] uppercase tracking-[0.5px] font-semibold text-muted-foreground border-b">
                  <span />
                  <span />
                  <span>Name / Email</span>
                  <span>Primary Domain</span>
                  <span>Secondary Domain</span>
                  <span>Program</span>
                  <span>Cohort</span>
                </div>
                <ul className="max-h-[320px] overflow-y-auto rounded-md border divide-y divide-border">
                  {filtered.length === 0 && (
                    <li className="py-8 text-center text-[13px] text-muted-foreground">No students match.</li>
                  )}
                  {filtered.map((s: any) => {
                    const isTaken = taken.has(s.id);
                    const isPicked = picked.has(s.id);
                    const prog = deriveProgram(s.roll_no || "");
                    const year = deriveCohortYear(s.roll_no || "");
                    const initials = (s.name || "").split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("");
                    const primaryDomain = (s.primary_domain || "").trim();
                    const secondaryDomain = (s.secondary_domain || "").trim();
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          disabled={isTaken}
                          onClick={() => toggle(s.id)}
                          className={cn(
                            "w-full grid grid-cols-[28px_32px_1fr_100px_100px_70px_60px] gap-2 items-center px-3 py-2 text-left transition-colors",
                            isTaken ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50",
                            isPicked && "bg-orange-50/60",
                          )}
                        >
                          <span className={cn("h-5 w-5 rounded border grid place-items-center shrink-0", isPicked ? "bg-orange-500 border-orange-500" : "bg-background border-border")}>
                            {isPicked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                          </span>
                          <span className={cn(
                            "h-7 w-7 rounded-full grid place-items-center text-[10px] font-semibold shrink-0",
                            prog === "YLC" ? "bg-teal-100 text-teal-700" : "bg-orange-100 text-orange-700",
                          )}>
                            {initials || "??"}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-foreground truncate">{s.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{s.email || "—"}</div>
                          </div>
                          <span className="text-[12px] text-muted-foreground truncate">{primaryDomain || "—"}</span>
                          <span className="text-[12px] text-muted-foreground truncate">{secondaryDomain || "—"}</span>
                          <span>
                            {prog ? (
                              <Badge variant="outline" className={cn(
                                "text-[10px] px-1.5 py-0",
                                prog === "YLC" ? "border-teal-200 text-teal-700 bg-teal-50" : "border-orange-200 text-orange-700 bg-orange-50",
                              )}>
                                {prog}
                              </Badge>
                            ) : <span className="text-[11px] text-muted-foreground">—</span>}
                          </span>
                          <span className="text-[12px] text-muted-foreground tabular-nums">{year || "—"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        ) : (
          <div className="px-5 py-4">
            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
              className={cn(
                "block h-[160px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all",
                drag ? "border-orange-500 bg-orange-50" : "border-border hover:border-orange-500 hover:bg-orange-50/50",
              )}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt"
                className="sr-only"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Upload className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              <div className="mt-2 text-[13px] text-muted-foreground">Drop CVs here or click to browse</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">PDF, DOCX, TXT · up to 20 files</div>
            </label>

            {files.length > 0 && (
              <ul className="mt-3 max-h-[180px] overflow-y-auto rounded-md border divide-y divide-border">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-[13px] text-foreground truncate">{f.name}</span>
                    <button
                      onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between">
          <span className="text-[12px] text-muted-foreground">
            {total > 0
              ? `${total} candidate${total === 1 ? "" : "s"} ready to add to ${roundId === "pool" ? "Pool" : (roundOptions.find((r) => r.id === roundId)?.name ?? "round")}`
              : "Nothing selected yet"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { reset(); onOpenChange(false); }}
              className="h-9 px-3 rounded-md text-[13px] text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={total === 0}
              className={cn(
                "h-9 px-4 rounded-md text-[13px] font-medium text-white transition-colors",
                total === 0 ? "bg-muted-foreground/30 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600",
              )}
            >
              Add {total || ""} to LMP Process
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
