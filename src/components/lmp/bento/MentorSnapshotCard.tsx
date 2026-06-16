import { useState, useMemo } from "react";
import {
  CalendarClock,
  UserCog,
  Search,
  CheckCircle2,
  ExternalLink,
  Star,
  Users2,
  PlusCircle,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Mentor } from "@/lib/mentor";
import type { LmpRecord } from "@/lib/lmpTypes";
import { useAllMentors } from "@/lib/hooks/useDbData";
import { linkedinHref } from "@/lib/linkedinUrl";
import { deriveInitials, pickAvatarColor } from "@/lib/avatarColors";

function mapDbMentor(m: any): Mentor {
  const source: Mentor["source"] = m.source === "MU" || m.source === "ALU" ? m.source : "EXT";
  return {
    id: m.id,
    name: m.name ?? "",
    initials: deriveInitials(m.name ?? ""),
    color: pickAvatarColor(m.id ?? m.name ?? ""),
    role: m.designation ?? "",
    company: m.company ?? "",
    source,
    score: Math.round(((m.rating ?? 0) as number) * 20),
    scores: { role: 0, skills: 0, company: 0, industry: 0, seniority: 0 },
    layer: "",
    decisionTags: [],
    rating: Number(m.rating ?? 0),
    reviews: Number(m.reviews ?? 0),
    outcome: 0,
    availability: (m.availability ?? "available") as Mentor["availability"],
    email: m.email ?? "",
    phone: m.phone ?? "",
    seniority: (m.seniority ?? "Mid") as Mentor["seniority"],
    linkedin: m.linkedin ?? undefined,
  };
}

const SOURCE_BADGE = {
  MU:  { bg: "bg-sage-50",      text: "text-sage-600", label: "Mentor Union" },
  ALU: { bg: "bg-sky-400/10",   text: "text-sky-400",  label: "Alumni" },
  EXT: { bg: "bg-n100",         text: "text-n600",     label: "External" },
} as const;

/* ── Internal row for each mentor in the search list ── */
function MentorRow({
  mentor,
  onSelect,
}: {
  mentor: Mentor;
  onSelect: (m: Mentor) => void;
}) {
  const badge = SOURCE_BADGE[mentor.source];
  return (
    <button
      type="button"
      onClick={() => onSelect(mentor)}
      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-n100/60"
    >
      {/* Avatar */}
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
          mentor.color
        )}
      >
        {mentor.initials}
      </span>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-n900">
            {mentor.name}
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full px-1.5 py-[1px] text-[10px] font-medium",
              badge.bg,
              badge.text
            )}
          >
            {badge.label}
          </span>
        </div>
        <div className="text-[11px] text-n500 truncate">
          {mentor.role} · {mentor.company}
        </div>
      </div>

      {/* Rating + score */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {mentor.rating != null && (
          <div className="flex items-center gap-1 text-[11px] text-amber-500">
            <Star className="h-3 w-3 fill-amber-400" />
            <span className="font-medium">{mentor.rating}</span>
          </div>
        )}
        <span className="text-[10px] text-n400 tabular-nums">
          Score {mentor.score}
        </span>
      </div>

      {/* Hover check */}
      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

/* ── Main card ── */
export function MentorSnapshotCard({
  rec,
  mode = "action",
  onAlignMentor,
}: {
  rec: LmpRecord;
  mode?: "action" | "summary";
  onAlignMentor?: (mentor: Mentor, replace: boolean) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "MU" | "ALU" | "EXT">("ALL");
  const [replaceMode, setReplaceMode] = useState(false);

  const { data: dbMentors = [] } = useAllMentors();
  const mentors = useMemo<Mentor[]>(() => (dbMentors as any[]).map(mapDbMentor), [dbMentors]);

  // Parse comma-separated mentor names from mentor_selected
  const mentorNames = useMemo(() => {
    const raw = (rec as any).mentorSelected || "";
    return raw ? (raw as string).split(/,\s*/).filter(Boolean) : [];
  }, [rec]);

  const aligned = mentorNames.length > 0;
  const isSummary = mode === "summary";

  // Resolve each name to a Mentor object for linkedin/role display
  const alignedMentors = useMemo(
    () =>
      mentorNames.map(
        (name) =>
          mentors.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? null,
      ),
    [mentorNames, mentors],
  );

  // Keep legacy single-mentor helpers for the first entry
  const mentorName = mentorNames[0] ?? "";
  const alignedMentor = alignedMentors[0] ?? null;
  const avatarColor = alignedMentor?.color ?? "bg-teal-200 text-teal-600";
  const initials = mentorName
    .split(/\s+/)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  /* Filtered + sorted mentors for modal */
  const filtered = useMemo(() => {
    let list = mentors;
    if (sourceFilter !== "ALL") {
      list = list.filter((m) => m.source === sourceFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.role.toLowerCase().includes(q) ||
          m.company.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => b.score - a.score);
  }, [search, sourceFilter, mentors]);

  const handleSelect = async (m: Mentor) => {
    await onAlignMentor?.(m, replaceMode);
    setOpen(false);
    setSearch("");
    setSourceFilter("ALL");
    setReplaceMode(false);
  };

  const handleOpen = () => setOpen(true);

  const sourceFilters: { key: "ALL" | "MU" | "ALU" | "EXT"; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "MU", label: "Mentor Union" },
    { key: "ALU", label: "Alumni" },
    { key: "EXT", label: "External" },
  ];

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border border-n200 p-4",
          isSummary ? "bg-n50/40" : "bg-card shadow-sm"
        )}
      >
        <h4 className="text-[13px] font-semibold text-n800 mb-3">Mentor</h4>

        {aligned ? (
          <div className="space-y-2">
            {/* All aligned mentors */}
            <div className="space-y-1.5">
              {mentorNames.map((name, i) => {
                const m = alignedMentors[i];
                const col = m?.color ?? "bg-teal-200 text-teal-600";
                const ini = name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
                return (
                  <div key={name} className="flex items-center gap-2">
                    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", col)}>
                      {ini}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[12px] font-medium text-n900 truncate">{name}</span>
                        {m?.linkedin && (
                          <a href={linkedinHref(m.linkedin)} target="_blank" rel="noopener noreferrer" className="text-n400 hover:text-primary">
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                      {m && <div className="text-[10.5px] text-n500 truncate">{m.role} · {m.company}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Status line */}
            <div className="flex items-center gap-1.5 text-[11px] text-green-600">
              <CalendarClock className="h-3 w-3" />
              {mentorNames.length === 1 ? "Mentor aligned ✓" : `${mentorNames.length} mentors aligned ✓`}
            </div>

            {/* Action buttons */}
            {!isSummary && onAlignMentor && (
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handleOpen}
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
                >
                  <PlusCircle className="h-3 w-3" /> Add another
                </button>
                <span className="text-n300">·</span>
                <button
                  type="button"
                  onClick={() => { setReplaceMode(true); handleOpen(); }}
                  className="inline-flex items-center gap-1 text-[11px] text-n500 hover:text-n800 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" /> Replace
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] text-n500 italic">
              No mentor aligned yet
            </p>
            {!isSummary && (
              <button
                type="button"
                onClick={handleOpen}
                className="inline-flex items-center gap-1.5 rounded-lg border border-n200 bg-card px-3 py-1.5 text-[12px] font-medium text-n700 hover:border-n300 hover:bg-n50 transition-colors"
              >
                <UserCog className="h-3.5 w-3.5" />
                Align Mentor
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Search modal ── */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setSearch(""); setSourceFilter("ALL"); setReplaceMode(false); } }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users2 className="h-4 w-4" />
              Select Mentor
            </DialogTitle>
          </DialogHeader>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-n400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, role, or company…"
              className="w-full rounded-lg border border-n200 bg-background py-2 pl-9 pr-3 text-[13px] outline-none transition-colors focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Add vs Replace toggle — only when mentors are already aligned */}
          {aligned && onAlignMentor && (
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-n600 font-medium">Mode:</span>
              <div className="flex rounded-lg overflow-hidden border border-n200 text-[11.5px]">
                <button
                  type="button"
                  onClick={() => setReplaceMode(false)}
                  className={cn("inline-flex items-center gap-1 px-2.5 py-1 font-medium transition-colors", !replaceMode ? "bg-orange-500 text-white" : "bg-card text-n600 hover:bg-n50")}
                >
                  <PlusCircle className="h-3 w-3" /> Add
                </button>
                <button
                  type="button"
                  onClick={() => setReplaceMode(true)}
                  className={cn("inline-flex items-center gap-1 px-2.5 py-1 font-medium transition-colors", replaceMode ? "bg-orange-500 text-white" : "bg-card text-n600 hover:bg-n50")}
                >
                  <RefreshCw className="h-3 w-3" /> Replace
                </button>
              </div>
            </div>
          )}

          {/* Source filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {sourceFilters.map((sf) => (
              <button
                key={sf.key}
                type="button"
                onClick={() => setSourceFilter(sf.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11.5px] font-medium border transition-colors",
                  sourceFilter === sf.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-card text-n600 border-n200 hover:border-n300"
                )}
              >
                {sf.label}
              </button>
            ))}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-n400 italic">
                No mentors found.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {filtered.map((m) => (
                  <MentorRow key={m.id} mentor={m} onSelect={handleSelect} />
                ))}
              </div>
            )}
          </div>

          {/* Footer note */}
          <p className="text-[11px] text-n400 text-center pt-1 border-t border-n100">
            Showing Mentor Union, Alumni, and external mentors — ranked by match
            score.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
