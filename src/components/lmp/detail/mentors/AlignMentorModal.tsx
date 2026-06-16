import { useMemo, useState } from "react";
import { Search, Star, UserPlus, X, RefreshCw, PlusCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Mentor, MentorSource } from "@/lib/mentor";
import { useAllMentors, useAlumniMentors } from "@/lib/hooks/useDbData";
import type { ALUMentor } from "@/lib/alumniStore";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function muRowToMentor(m: any): Mentor {
  const src: MentorSource = m.source === "ALU" ? "ALU" : "MU";
  return {
    id: m.id,
    name: m.name || "Unknown",
    initials: initials(m.name || "?"),
    color: "bg-orange-200 text-orange-600",
    role: m.designation || m.role || "",
    company: m.company || "",
    source: src,
    score: 0,
    scores: { role: 0, skills: 0, company: 0, industry: 0, seniority: 0 },
    layer: "",
    decisionTags: [],
    rating: Number(m.rating) || 0,
    reviews: Number(m.reviews) || 0,
    outcome: 0,
    availability: (m.availability as any) || "available",
    email: m.email || "",
    phone: m.phone || "",
    seniority: (m.seniority as any) || "Mid",
    linkedin: m.linkedin || undefined,
    mentorUnion: src === "MU",
    remunerationInr: Number(m.rate) || 0,
  };
}

function aluToMentor(a: ALUMentor): Mentor {
  const role = a.currentRole || "";
  const company = a.currentCompany || a.company2 || "";
  return {
    id: a.id,
    name: a.name,
    initials: initials(a.name),
    color: "bg-sky-100 text-sky-700",
    role,
    company,
    source: "ALU",
    score: 0,
    scores: { role: 0, skills: 0, company: 0, industry: 0, seniority: 0 },
    layer: "",
    decisionTags: [],
    rating: 0,
    reviews: 0,
    outcome: 0,
    availability: "available",
    email: a.muEmail || "",
    phone: "",
    seniority: "Mid",
    linkedin: a.linkedin || undefined,
    mentorUnion: false,
  };
}

export function AlignMentorModal({
  open,
  onOpenChange,
  onAlign,
  role,
  company,
  assignedIds,
  existingAssignedCount = 0,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAlign: (mentor: Mentor, replace: boolean) => void | Promise<void>;
  role?: string;
  company?: string;
  assignedIds?: Set<string>;
  existingAssignedCount?: number;
}) {
  const { data: muMentors = [] } = useAllMentors();
  const { mentors: alumniMentors } = useAlumniMentors();

  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "MU" | "ALU">("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [minRating, setMinRating] = useState<number>(0);
  const [aligningId, setAligningId] = useState<string | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);

  const allMentors: Mentor[] = useMemo(() => {
    const mu = (muMentors as any[]).map(muRowToMentor);
    const alu = alumniMentors.map(aluToMentor);
    // dedupe by email or id
    const seen = new Set<string>();
    const merged: Mentor[] = [];
    for (const m of [...mu, ...alu]) {
      const key = (m.email || m.id).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(m);
    }
    return merged;
  }, [muMentors, alumniMentors]);

  const companies = useMemo(() => {
    const s = new Set<string>();
    allMentors.forEach((m) => m.company && s.add(m.company));
    return Array.from(s).sort();
  }, [allMentors]);

  const roles = useMemo(() => {
    const s = new Set<string>();
    allMentors.forEach((m) => m.role && s.add(m.role));
    return Array.from(s).sort();
  }, [allMentors]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allMentors.filter((m) => {
      if (sourceFilter !== "all" && m.source !== sourceFilter) return false;
      if (companyFilter !== "all" && m.company !== companyFilter) return false;
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (minRating > 0 && (m.rating || 0) < minRating) return false;
      if (q) {
        const hay = `${m.name} ${m.company} ${m.role} ${m.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allMentors, query, sourceFilter, companyFilter, roleFilter, minRating]);

  const handleAlign = async (m: Mentor) => {
    setAligningId(m.id);
    try {
      await onAlign(m, replaceMode);
      onOpenChange(false);
    } finally {
      setAligningId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-n100">
          <DialogTitle className="text-[18px] font-semibold text-n900">Align a mentor</DialogTitle>
          {(role || company) && (
            <p className="text-[13px] text-n500 mt-0.5">
              For {role}{company ? ` @ ${company}` : ""} · pick from Mentor Union + Alumni pool
            </p>
          )}
        </DialogHeader>

        {/* Add vs Replace toggle — only shown when at least one mentor is already assigned */}
        {existingAssignedCount > 0 && (
          <div className="px-6 py-2.5 border-b border-n100 bg-amber-50/60">
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-amber-800 font-medium">
                {existingAssignedCount} mentor{existingAssignedCount > 1 ? "s" : ""} already aligned:
              </span>
              <div className="flex rounded-lg overflow-hidden border border-amber-200 text-[12px]">
                <button
                  onClick={() => setReplaceMode(false)}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1.5 font-medium transition-colors",
                    !replaceMode
                      ? "bg-orange-500 text-white"
                      : "bg-card text-n600 hover:bg-n50",
                  )}
                >
                  <PlusCircle className="h-3 w-3" /> Add to existing
                </button>
                <button
                  onClick={() => setReplaceMode(true)}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1.5 font-medium transition-colors",
                    replaceMode
                      ? "bg-orange-500 text-white"
                      : "bg-card text-n600 hover:bg-n50",
                  )}
                >
                  <RefreshCw className="h-3 w-3" /> Replace all
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-n100 bg-n50/40 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-n400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, company, role, email…"
              className="w-full rounded-lg border border-n200 bg-card pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "MU", "ALU"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                className={cn(
                  "px-2.5 py-1 rounded-full border text-[12px] font-medium transition-colors",
                  sourceFilter === s
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-card text-n700 border-n200 hover:bg-n100",
                )}
              >
                {s === "all" ? "All sources" : s === "MU" ? "Mentor Union" : "Alumni"}
              </button>
            ))}

            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-md border border-n200 bg-card px-2 py-1 text-[12px] text-n700 max-w-[180px]"
            >
              <option value="all">All companies</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-md border border-n200 bg-card px-2 py-1 text-[12px] text-n700 max-w-[180px]"
            >
              <option value="all">All roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <label className="ml-auto flex items-center gap-2 text-[12px] text-n600">
              Min rating
              <input
                type="range"
                min={0}
                max={5}
                step={0.5}
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="w-24 accent-orange-500"
              />
              <span className="tabular-nums w-6">{minRating}</span>
            </label>

            <div className="text-[12px] text-n500 ml-1">
              {filtered.length} of {allMentors.length}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="max-h-[60vh] overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-n500">
              No mentors match your filters.
            </div>
          ) : (
            <ul className="divide-y divide-n100">
              {filtered.map((m) => {
                const alreadyAligned = assignedIds?.has(m.id);
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-n50/60"
                  >
                    <div className={cn("h-10 w-10 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0", m.color)}>
                      {m.initials || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[14px] font-semibold text-n900 truncate">{m.name}</span>
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-[0.5px] font-semibold px-1.5 py-0.5 rounded",
                            m.source === "MU"
                              ? "bg-orange-50 text-orange-600 border border-orange-200"
                              : "bg-sky-50 text-sky-700 border border-sky-200",
                          )}
                        >
                          {m.source}
                        </span>
                      </div>
                      <div className="text-[12px] text-n600 truncate">
                        {[m.role, m.company].filter(Boolean).join(" · ") || "—"}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-n500">
                        {m.rating > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                            {m.rating.toFixed(1)} ({m.reviews})
                          </span>
                        )}
                        {m.seniority && <span>{m.seniority}</span>}
                        {m.email && <span className="truncate max-w-[200px]">{m.email}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAlign(m)}
                      disabled={!!aligningId || alreadyAligned}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors shrink-0",
                        alreadyAligned
                          ? "bg-n100 text-n500 cursor-not-allowed"
                          : "bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50",
                      )}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {alreadyAligned ? "Aligned" : aligningId === m.id ? "Aligning…" : "Align"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
