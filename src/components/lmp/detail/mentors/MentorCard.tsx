import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Mail, Phone, MessageCircle, Linkedin, Star, Eye, Check,
  ChevronDown, IndianRupee, History, Building2, GraduationCap, UserCircle2,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Mentor, type MentorSource, SOURCE_META, SCORE_DIM_COLORS, SCORE_DIM_MAX } from "@/lib/mentor";
import { linkedinHref } from "@/lib/linkedinUrl";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { toast } from "sonner";

function scoreToPct(score: number): number {
  const pct = score > 45 ? Math.round(score) : Math.round((score / 45) * 100);
  return Math.max(0, Math.min(100, pct));
}
function scoreBadgeClass(pct: number): string {
  if (pct >= 85) return "bg-teal-100 text-teal-700 border-teal-200";
  if (pct >= 70) return "bg-green-100 text-green-700 border-green-200";
  if (pct >= 55) return "bg-yellow-100 text-yellow-700 border-yellow-200";
  return "bg-n100 text-n500 border-n200";
}
function sourceBadgeClass(source: MentorSource): string {
  if (source === "MU") return "bg-orange-100 text-orange-600";
  if (source === "ALU") return "bg-sky-100 text-sky-700";
  return "bg-purple-100 text-purple-700";
}

const DIMS: (keyof Mentor["scores"])[] = ["role", "skills", "company", "industry", "seniority"];
const DIM_LABEL: Record<keyof Mentor["scores"], string> = {
  role: "Role", skills: "Skills", company: "Company", industry: "Industry", seniority: "Seniority",
};

export function MentorCard({
  mentor, index, onShortlist, onView, onSelect, readOnly = false,
}: {
  mentor: Mentor;
  index: number;
  onShortlist: () => void;
  onView: () => void;
  onSelect: () => void;
  readOnly?: boolean;
}) {
  const meta = SOURCE_META[mentor.source];
  const [expanded, setExpanded] = useState(false);

  const phoneDigits = (mentor.phone || "").replace(/[^\d]/g, "");
  const mailHref = `mailto:${mentor.email}?subject=${encodeURIComponent(`Mentorship request — ${mentor.name}`)}`;
  const waHref = phoneDigits ? `https://wa.me/${phoneDigits}` : "#";
  const liHref = linkedinHref(mentor.linkedin);

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.05 }}
      className="rounded-2xl bg-card border border-n200 shadow-sm hover:shadow-md hover:border-n300 transition-all duration-220 overflow-hidden"
    >
    <div className="p-4">
      <div className="flex items-center gap-3">
        {/* Avatar + source */}
        <div className="relative shrink-0">
          <div className={cn("h-11 w-11 rounded-full flex items-center justify-center text-[13px] font-semibold", mentor.color)}>
            {mentor.initials}
          </div>
          <span className={cn("absolute -bottom-1 -right-1 rounded-full border px-1 text-[8px] font-bold uppercase tracking-[0.5px] bg-card", meta.chip)}>
            {mentor.source}
          </span>
        </div>

        {mentor.possibleDuplicate && (
          <span className="shrink-0 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700 px-1.5 py-[1px] text-[10px] font-medium">
            ⚠ Possible duplicate
          </span>
        )}

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-semibold text-n900 truncate">{mentor.name}</span>
            <span className={cn(
              "shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-[0.5px]",
              sourceBadgeClass(mentor.source),
            )}>
              {mentor.source}
            </span>
            {mentor.availability === "available" ? (
              <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-sage-50 border border-sage-200 text-sage-600 px-1.5 text-[10px] font-medium">
                <Check className="h-2.5 w-2.5" /> Available
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-coral-50 border border-coral-200 text-coral-600 px-1.5 text-[10px] font-medium">
                Busy
              </span>
            )}
          </div>
          <div className="text-[12px] text-n500 truncate">{mentor.role} @ {mentor.company}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-n500">
            {mentor.rating != null && (
              <>
                <span className="inline-flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  <span className="font-medium tabular-nums text-n700">{mentor.rating.toFixed(1)}</span>
                  {mentor.reviews != null && <span className="text-n400">({mentor.reviews})</span>}
                </span>
                <span className="text-n300">·</span>
              </>
            )}
            <span className="text-sage-600 font-medium">{mentor.outcome}% goal met</span>
            {mentor.remunerationInr && (
              <>
                <span className="text-n300">·</span>
                <span className="inline-flex items-center text-n700">
                  <IndianRupee className="h-2.5 w-2.5" />
                  <span className="tabular-nums">{mentor.remunerationInr.toLocaleString("en-IN")}</span>
                  <span className="text-n400">/session</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Score */}
        {(() => {
          const pct = scoreToPct(mentor.score);
          return (
            <div className={cn(
              "shrink-0 inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[13px] font-bold tabular-nums",
              scoreBadgeClass(pct),
            )}>
              {pct}%
            </div>
          );
        })()}
      </div>

      {/* Tags + contact icons */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-wrap gap-1 min-w-0">
          {mentor.source === "EXT" && mentor.platform ? (
            (() => {
              const platformUrl =
                mentor.external_links?.booking ||
                (mentor.platform === "LinkedIn" ? (mentor.external_links?.linkedin || liHref || null) : null) ||
                (mentor as any).source_url ||
                null;
              return platformUrl ? (
                <a
                  href={platformUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open profile on ${mentor.platform}`}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 px-2 text-[10px] font-medium"
                >
                  {mentor.platform} ↗
                </a>
              ) : (
                <span className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 px-2 text-[10px] font-medium">
                  {mentor.platform}
                </span>
              );
            })()
          ) : mentor.tier_label ? (
            <span className={cn(
              "rounded-full border px-2 text-[10px] font-medium",
              tierBadgeClass(mentor.tier),
            )}>
              {mentor.tier_label}
            </span>
          ) : null}
          {mentor.decisionTags.map((t) => (
            <span key={t.label} className="rounded-full bg-orange-50 border border-orange-200 text-orange-700 px-2 text-[10px] font-medium">
              {t.emoji} {t.label}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <ContactIcon kind="email" value={mentor.email} href={mailHref} icon={<Mail className="h-3 w-3" />} />
          <ContactIcon kind="phone" value={mentor.phone} href={phoneDigits ? `tel:${phoneDigits}` : "#"} icon={<Phone className="h-3 w-3" />} />
          <ContactIcon kind="whatsapp" value={mentor.phone} href={waHref} icon={<MessageCircle className="h-3 w-3" />} className="bg-sage-50 text-sage-600 hover:bg-sage-100" />
          <ContactIcon kind="linkedin" value={mentor.linkedin ? liHref : ""} href={liHref} icon={<Linkedin className="h-3 w-3" />} className="bg-sky-400/10 text-sky-400 hover:bg-sky-400/20" />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-1.5">
        <button
          onClick={onView}
          className="inline-flex items-center gap-1 rounded-md text-n700 hover:bg-n100 px-2 py-1.5 text-[12px] font-medium transition-colors"
        >
          <Eye className="h-3 w-3" /> Profile
        </button>
        {!readOnly && <button
          onClick={onShortlist}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[12px] font-medium transition-colors",
            mentor.shortlisted
              ? "bg-yellow-50 border-yellow-200 text-yellow-600"
              : "bg-card border-n300 text-n700 hover:bg-n100",
          )}
        >
          <Star className={cn("h-3 w-3", mentor.shortlisted && "fill-yellow-500 text-yellow-500")} />
          {mentor.shortlisted ? "Shortlisted" : "Shortlist"}
        </button>}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md text-n500 hover:bg-n100 hover:text-n800 px-2 py-1.5 text-[12px] font-medium transition-colors"
        >
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            className="inline-flex"
          >
            <ChevronDown className="h-3 w-3" />
          </motion.span>
          {expanded ? "Less" : "Details"}
        </button>
        {!readOnly && <button
          onClick={onSelect}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium px-3 py-1.5 shadow-sm transition-colors"
        >
          Select →
        </button>}
      </div>
    </div>

    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          key="details"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden border-t border-n200 bg-n50"
        >
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Match Analysis (full width, above past experience) */}
            {mentor.score_breakdown && mentor.match_signals && (
              <MatchAnalysisPanel mentor={mentor} />
            )}

            {/* Past experience */}
            <Section title="Past experience" Icon={Building2}>
              {mentor.pastExperience?.length ? (
                <ul className="space-y-1.5">
                  {mentor.pastExperience.map((e, i) => (
                    <li key={i} className="text-[12px]">
                      <span className="text-n900 font-medium">{e.role}</span>
                      <span className="text-n500"> · {e.company}</span>
                      <span className="text-n400"> · {e.years}</span>
                    </li>
                  ))}
                </ul>
              ) : <Empty />}
            </Section>

            {/* Mentorship history */}
            <Section title="Mentorship history" Icon={History}>
              {mentor.mentorshipHistory?.length ? (
                <ul className="space-y-1.5">
                  {mentor.mentorshipHistory.map((h, i) => (
                    <li key={i} className="text-[12px] flex items-center gap-2">
                      <span className="text-n900 font-medium">{h.reqRole}</span>
                      <span className="text-n500">@ {h.reqCompany}</span>
                      <OutcomePill outcome={h.outcome} />
                      {h.rating && <span className="text-n500 tabular-nums">★ {h.rating.toFixed(1)}</span>}
                    </li>
                  ))}
                </ul>
              ) : <Empty />}
            </Section>

            {/* Remuneration */}
            <Section title="Remuneration" Icon={IndianRupee}>
              <div className="text-[13px] text-n900 font-medium tabular-nums">
                ₹ {(mentor.remunerationInr ?? 0).toLocaleString("en-IN")} <span className="text-n500 font-normal text-[12px]">/ session</span>
              </div>
              <div className="text-[11px] text-n500 mt-0.5">
                Source: {meta.label}
              </div>
            </Section>

            {/* Internal mapping */}
            <Section title="Internal mapping" Icon={UserCircle2}>
              {mentor.internal ? (
                <ul className="space-y-1 text-[12px]">
                  <li><span className="text-n500">LMP Owner:</span> <span className="text-n900 font-medium">{mentor.internal.lmpOwner}</span></li>
                  <li><span className="text-n500">POC:</span> <span className="text-n900 font-medium">{mentor.internal.poc}</span></li>
                  <li>
                    <span className="text-n500">Feedback:</span>{" "}
                    <span className="text-n900 font-medium tabular-nums">★ {mentor.internal.feedbackAvg.toFixed(1)}</span>
                    <span className="text-n400"> ({mentor.internal.feedbackCount})</span>
                  </li>
                </ul>
              ) : <Empty />}
            </Section>

            {/* Ratings rollup */}
            <Section title="Ratings" Icon={GraduationCap} wide>
              <div className="flex items-center gap-3 text-[12px]">
                {mentor.rating != null ? (
                  <>
                    <span className="text-yellow-500">{"★".repeat(Math.round(mentor.rating))}{"☆".repeat(5 - Math.round(mentor.rating))}</span>
                    <span className="text-n900 font-medium tabular-nums">{mentor.rating.toFixed(1)}/5</span>
                    {mentor.reviews != null && <span className="text-n400">over {mentor.reviews} sessions</span>}
                  </>
                ) : (
                  <span className="text-n400">No rating yet</span>
                )}
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-sage-50 border border-sage-200 text-sage-700 px-2 py-0.5 text-[11px] font-medium">
                  Outcome {mentor.outcome}%
                </span>
              </div>
            </Section>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </motion.article>
  );
}

const KIND_LABEL = {
  email: "Email",
  phone: "Phone",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
} as const;

function ContactIcon({
  kind, value, href, icon, className,
}: {
  kind: "email" | "phone" | "whatsapp" | "linkedin";
  value: string;
  href: string;
  icon: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const hasValue = Boolean(value && value.trim() && value !== "#");
  const label = KIND_LABEL[kind];
  const openInNewTab = kind === "whatsapp" || kind === "linkedin";

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasValue) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`Copied ${label.toLowerCase()}`);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const baseChip = cn(
    "h-7 w-7 rounded-full bg-n100 text-n500 flex items-center justify-center transition-colors",
    hasValue ? "hover:bg-n200 hover:text-n800 cursor-pointer" : "opacity-40 cursor-not-allowed",
    className,
  );

  const trigger = hasValue ? (
    <a
      href={href}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noopener noreferrer" : undefined}
      onClick={(e) => e.stopPropagation()}
      className={baseChip}
      aria-label={label}
    >
      {icon}
    </a>
  ) : (
    <span className={baseChip} aria-label={`${label} unavailable`}>{icon}</span>
  );

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="center"
        className="w-64 p-2.5 rounded-lg border-n200 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] uppercase tracking-[0.5px] font-medium text-n500 mb-1">{label}</div>
        {hasValue ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 text-[12px] font-mono text-n800 truncate" title={value}>
              {value}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-n200 bg-card px-2 py-1 text-[11px] font-medium text-n700 hover:bg-n50 transition-colors"
            >
              {copied ? <Check className="h-3 w-3 text-sage-600" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <div className="text-[12px] text-n400 italic">Not available</div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function Section({ title, Icon, children, wide }: { title: string; Icon: typeof Building2; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("rounded-lg bg-card border border-n200 p-3", wide && "md:col-span-2")}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.5px] text-n500 font-medium mb-2">
        <Icon className="h-3 w-3" strokeWidth={2} />
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="text-[12px] text-n400 italic">No data yet.</div>;
}

function OutcomePill({ outcome }: { outcome: "converted" | "not-converted" | "ongoing" }) {
  const map = {
    converted: "bg-sage-50 border-sage-200 text-sage-700",
    "not-converted": "bg-coral-50 border-coral-200 text-coral-700",
    ongoing: "bg-yellow-50 border-yellow-200 text-yellow-700",
  } as const;
  const label = outcome === "not-converted" ? "Not converted" : outcome[0].toUpperCase() + outcome.slice(1);
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium", map[outcome])}>
      {label}
    </span>
  );
}

function tierBadgeClass(tier?: Mentor["tier"]): string {
  switch (tier) {
    case "L1":
    case "L2":
      return "bg-sage-50 border-sage-200 text-sage-700";
    case "L3":
      return "bg-teal-50 border-teal-200 text-teal-700";
    case "L4":
      return "bg-yellow-50 border-yellow-200 text-yellow-700";
    case "L5":
    default:
      return "bg-n100 border-n200 text-n600";
  }
}

const DIM_META: { key: keyof NonNullable<Mentor["score_breakdown"]>; label: string; max: number; bar: string }[] = [
  { key: "skill",     label: "Skill Match", max: 20, bar: "bg-orange-400" },
  { key: "seniority", label: "Seniority",   max: 10, bar: "bg-purple-400" },
  { key: "prestige",  label: "Prestige",    max: 5,  bar: "bg-sky-400" },
  
  { key: "source",    label: "Source",      max: 5,  bar: "bg-sage-400" },
];

function MatchAnalysisPanel({ mentor }: { mentor: Mentor }) {
  const sb = mentor.score_breakdown!;
  const sig = mentor.match_signals!;
  const rank = mentor.rank ?? 1;

  return (
    <div className="md:col-span-2 rounded-lg bg-card border border-n200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.5px] text-n500 font-medium">
          <span>Match Analysis</span>
        </div>
        <span className="text-[11px] text-n500">
          Score: <span className="font-semibold text-n900 tabular-nums">{sb.total} / 40</span>
        </span>
      </div>

      <p className="text-[12px] text-n600 mb-3">
        Why this mentor ranks <span className="font-semibold text-n800">#{rank}</span> for this process
      </p>

      {/* Dimension pills with progress bars */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {DIM_META.map((d) => {
          const v = sb[d.key];
          const pct = Math.max(0, Math.min(100, (v / d.max) * 100));
          return (
            <div key={d.key} className="rounded-md border border-n200 bg-n50 px-2 py-1.5">
              <div className="flex items-center justify-between text-[10px] text-n600">
                <span className="font-medium">{d.label}</span>
                <span className="tabular-nums text-n800 font-semibold">{v}/{d.max}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-n200 overflow-hidden">
                <div className={cn("h-full rounded-full", d.bar)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Matched skills */}
      {sig.matched_skills.length > 0 && (
        <div className="mb-2">
          <div className="text-[11px] text-n600 mb-1">✅ Matched Skills</div>
          <div className="flex flex-wrap gap-1">
            {sig.matched_skills.map((s) => (
              <span key={s} className="rounded-full bg-teal-50 border border-teal-200 text-teal-700 px-2 py-0.5 text-[10px] font-medium">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Missing skills */}
      {sig.missing_skills.length > 0 && (
        <div className="mb-2">
          <div className="text-[11px] text-n600 mb-1">⚠️ Skill Gaps (not covered)</div>
          <div className="flex flex-wrap gap-1">
            {sig.missing_skills.map((s) => (
              <span key={s} className="rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700 px-2 py-0.5 text-[10px] font-medium">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Signals */}
      <ul className="mt-2 space-y-1 text-[12px] text-n700">
        <li><span className="text-n500">🏢 Company Signal —</span> {sig.company_note}</li>
        <li><span className="text-n500">📈 Seniority Signal —</span> {sig.seniority_note}</li>
        <li><span className="text-n500">🔖 Source —</span> {sig.source_note}</li>
        {sig.gap_coverage.length > 0 && (
          <li className="rounded-md bg-orange-50 border border-orange-200 text-orange-800 px-2 py-1 mt-1">
            🎯 Covers your skill gap: this mentor covers {sig.gap_coverage.length} of your identified gaps
            ({sig.gap_coverage.join(", ")})
          </li>
        )}
        {mentor.source === "EXT" && mentor.platform && (
          <li className="rounded-md bg-sky-50 border border-sky-200 text-sky-900 px-2 py-1 mt-1 flex items-center gap-2 flex-wrap">
            <span>🌐 <span className="text-n500">External Source —</span> Found on <span className="font-medium">{mentor.platform}</span></span>
            {mentor.rating != null && <span>· {mentor.rating.toFixed(1)}★</span>}
            {mentor.sessions_taken != null && <span>· {mentor.sessions_taken} sessions</span>}
            {mentor.remunerationInr != null && <span>· ₹{mentor.remunerationInr.toLocaleString("en-IN")}/session</span>}
            {mentor.external_links?.booking && (
              <a
                href={mentor.external_links.booking}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 rounded-md bg-card border border-sky-300 text-sky-700 hover:bg-sky-100 px-2 py-0.5 text-[11px] font-medium"
              >
                Book Now ↗
              </a>
            )}
          </li>
        )}
        {mentor.source === "EXT" && (mentor.email || mentor.phone) && (
          <li className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 px-2 py-1 mt-1 flex items-center gap-3 flex-wrap">
            <span className="text-n500 font-medium">✅ Verified contact</span>
            {mentor.email && (
              <a href={`mailto:${mentor.email}`} className="inline-flex items-center gap-1 hover:underline">
                📧 {mentor.email}
              </a>
            )}
            {mentor.phone && (
              <a href={`tel:${mentor.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 hover:underline">
                📞 {mentor.phone}
              </a>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
