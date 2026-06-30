import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { ChevronDown, Info, Play, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ViewAllPocsModal } from "@/components/datasources/ViewAllPocsModal";
import { AdminThresholdsPanel } from "@/components/admin/AdminThresholdsPanel";
import { useDomains, useAllPocDomainMappings, usePocProfiles, type DerivedAllocationMapping } from "@/lib/hooks/useDbData";
import { usePocRegistry, type PocRegistryEntry } from "@/lib/hooks/usePocRegistry";
import {
  allocatePoc,
  PATH_LABELS,
  PATH_DESCRIPTIONS,
  TAG_STYLES,
  type AllocationMapping,
  type AllocationResult,
} from "@/lib/pocAllocation";
import type { PocCapability } from "@/lib/pocCapability";

type MappingRow = DerivedAllocationMapping;

type DomainRow = {
  id: string;
  name: string;
  slug: string;
};

function toPocCapability(entry: PocRegistryEntry): PocCapability {
  const primaryDomains = entry.primary_domain ? [entry.primary_domain] : [];
  return {
    id: entry.id,
    name: entry.name,
    initials: entry.initials,
    domains: entry.domains,
    primaryDomains,
    secondaryDomains: entry.domains.filter(
      (domain) => domain.toLowerCase() !== entry.primary_domain?.toLowerCase(),
    ),
    label: entry.label,
    color: entry.color,
    pocType: entry.poc_type === "outreach" ? "outreach" : "prep",
    currentLoad: 0,
    maxThreshold: entry.max_threshold,
    skillTags: entry.skill_tags,
    lastAssignedAt: entry.last_assigned_at,
    availability: entry.availability,
    behavioralPoolMember: entry.behavioral_pool_member,
    companyExperience: entry.company_experience,
    recruiterOwnership: entry.recruiter_ownership,
    accessLevel: entry.access_level,
  };
}

export default function PocDomainsPage() {
  const [pocsModalOpen, setPocsModalOpen] = useState(false);

  useRealtimeInvalidate("poc_profiles", [["db-all-poc-profiles"]], { enabled: true });
  useRealtimeInvalidate("domains", [["db-domains"]], { enabled: true });

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[24px] font-semibold tracking-[-0.5px] text-n900">
            POC Domain Mapping
          </h3>
          <p className="text-[13px] text-n500 mt-1 max-w-3xl">
            Configure how the v7 allocation engine picks a Prep POC. Each POC opts into{" "}
            <strong className="text-n700">primary</strong> (full domain weight) or{" "}
            <strong className="text-n700">secondary</strong> (partial weight) domains. The engine
            filters by threshold, boosts underutilized POCs (&lt;40% load), scores on
            domain + expertise + load + fairness, then returns a Prep POC plus up to 3
            Suggested Support POCs with confidence scores. Path C admin mappings always win
            when present.
          </p>
        </div>
        <button
          onClick={() => setPocsModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-n300 bg-card px-3 py-1.5 text-[13px] font-medium text-n800 hover:bg-n50 shadow-sm shrink-0"
        >
          <UserPlus className="h-4 w-4" /> Manage POCs
        </button>
      </header>

      <AllocationPathsCard />
      <TestAllocationPanel />
      <AdminThresholdsPanel />

      <ViewAllPocsModal open={pocsModalOpen} onOpenChange={setPocsModalOpen} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Allocation Paths info card
// ─────────────────────────────────────────────────────────────────────────────

function AllocationPathsCard() {
  const items: Array<{
    path: "A" | "B" | "C";
    when: string;
    dot: string;
  }> = [
    { path: "A", when: "No JD, no admin mappings", dot: "bg-sage-400" },
    { path: "B", when: "JD uploaded, no mappings", dot: "bg-teal-400" },
    { path: "C", when: "Admin mappings exist for the domain", dot: "bg-purple-400" },
  ];

  return (
    <section className="rounded-2xl bg-card border border-n200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-n200 bg-n50/60 flex items-center gap-2">
        <Info className="h-3.5 w-3.5 text-n500" />
        <h4 className="text-[14px] font-medium text-n900">How allocation paths work</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3">
        {items.map((it, i) => (
          <div
            key={it.path}
            className={cn(
              "p-4",
              i < items.length - 1 && "md:border-r border-n200 border-b md:border-b-0",
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn("h-2 w-2 rounded-full", it.dot)} />
              <span className="text-[12.5px] font-semibold text-n900">{PATH_LABELS[it.path]}</span>
            </div>
            <p className="text-[11.5px] text-n500 mb-1">{it.when}</p>
            <p className="text-[12px] text-n700 leading-snug">{PATH_DESCRIPTIONS[it.path]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Two-column board
// ─────────────────────────────────────────────────────────────────────────────

function DomainMappingsBoard() {
  const { data: domains = [] } = useDomains();
  const { data: pocs = [] } = usePocRegistry();
  const { data: pocProfiles = [] } = usePocProfiles();
  const { data: allMappings = [], isLoading } = useAllPocDomainMappings();

  const domainList = useMemo<DomainRow[]>(
    () =>
      (domains as any[]).map(d => ({
        id: String(d.id),
        name: String(d.name),
        slug: String(d.slug || d.name).toLowerCase(),
      })),
    [domains],
  );

  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string>("");

  const filteredDomains = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return domainList;
    return domainList.filter(d => d.name.toLowerCase().includes(q) || d.slug.includes(q));
  }, [domainList, search]);

  const activeSlug = selectedSlug || filteredDomains[0]?.slug || domainList[0]?.slug || "";
  const activeName = domainList.find(d => d.slug === activeSlug)?.name ?? activeSlug;

  // Mapping count per domain slug (for left panel badges).
  const activeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of allMappings as MappingRow[]) {
      if (!m.is_active) continue;
      const slug = (m.domain_slug || "").toLowerCase();
      map.set(slug, (map.get(slug) ?? 0) + 1);
    }
    return map;
  }, [allMappings]);

  const rows = useMemo<MappingRow[]>(
    () =>
      (allMappings as MappingRow[])
        .filter(m => (m.domain_slug || "").toLowerCase() === activeSlug)
        .sort((a, b) => a.priority - b.priority),
    [allMappings, activeSlug],
  );

  const profileRoleByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pocProfiles as any[]) {
      if (p?.name && p?.role_type) map.set(String(p.name).toLowerCase(), String(p.role_type));
    }
    return map;
  }, [pocProfiles]);

  return (
    <section className="rounded-2xl bg-card border border-n200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-n200 bg-n50/60">
        <h4 className="text-[14px] font-medium text-n900">Domain → POC Mappings (Path C)</h4>
        <p className="text-[11px] text-n500">
          Pick a domain on the left to manage its assigned POCs. When mappings exist, the
          allocator uses them first.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
        {/* LEFT: domains list */}
        <aside className="border-b md:border-b-0 md:border-r border-n200 bg-n50/30 max-h-[520px] flex flex-col">
          <div className="px-3 py-2.5 border-b border-n200 bg-card">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-n400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search domains"
                className="w-full pl-7 pr-2 py-1.5 text-[12px] rounded-md border border-n300 bg-card focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
          </div>
          <ul className="overflow-y-auto flex-1 py-1">
            {filteredDomains.length === 0 && (
              <li className="px-4 py-3 text-[12px] text-n500 italic">No domains match.</li>
            )}
            {filteredDomains.map(d => {
              const count = activeCounts.get(d.slug) ?? 0;
              const selected = d.slug === activeSlug;
              return (
                <li key={d.id}>
                  <button
                    onClick={() => setSelectedSlug(d.slug)}
                    className={cn(
                      "w-full text-left flex items-center justify-between gap-2 px-4 py-2 border-l-2 transition-colors",
                      selected
                        ? "border-orange-500 bg-orange-50 text-n900"
                        : "border-transparent hover:bg-n100 text-n700",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium truncate">{d.name}</span>
                      <span className="block text-[10.5px] text-n500 truncate">{d.slug}</span>
                    </span>
                    {count > 0 ? (
                      <span className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 text-[10.5px] font-semibold rounded-full bg-purple-100 text-purple-700">
                        {count}
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center text-[10px] uppercase tracking-[0.5px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-[1px]">
                        Unmapped
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* RIGHT: assignments for selected domain (read-only — derived live from POC profiles) */}
        <div className="flex flex-col">
          <div className="px-5 py-3 border-b border-n200 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-n900 truncate">{activeName || "—"}</div>
              <div className="text-[11px] text-n500">
                {rows.length} mapping{rows.length === 1 ? "" : "s"} · derived live from POC profiles
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.5px] font-medium rounded-full px-2 py-[1px] border border-n200 bg-n50 text-n500">
              <Info className="h-3 w-3" /> Read-only
            </span>
          </div>

          <div className="px-5 py-3 border-b border-n100 bg-amber-50/40 flex items-start gap-2 text-[11.5px] text-amber-900">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-700" />
            <span className="leading-relaxed">
              Path C mappings are derived live from each POC's <strong>primary domain</strong> and
              <strong> domain tags</strong>, ordered by current active load (least loaded first).
              To change who maps to <strong>{activeName}</strong>, edit the POC profile via{" "}
              <em>Manage POCs</em> above.
            </span>
          </div>

          <div className="px-5 py-4 flex-1">
            {isLoading ? (
              <div className="text-[12px] text-n500">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="text-[12px] text-n500 italic">
                No POCs currently map to{" "}
                <strong className="text-n700 not-italic">{activeName}</strong>. The allocator will
                fall back to Path B (JD scoring) or Path A (load-only).
              </div>
            ) : (
              <ul className="space-y-1.5">
                {rows.map((r) => {
                  const role =
                    profileRoleByName.get(r.poc_name.toLowerCase()) ||
                    pocs.find(p => p.id === r.poc_id)?.poc_type ||
                    "prep";
                  const initials =
                    pocs.find(p => p.id === r.poc_id)?.initials ||
                    r.poc_name.slice(0, 2).toUpperCase();
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 rounded-md border border-n200 bg-card px-3 py-2"
                    >
                      <span className="text-[11px] tabular-nums w-6 text-n500 font-medium">
                        #{r.priority}
                      </span>
                      <span className="h-7 w-7 rounded-full bg-purple-100 text-purple-700 grid place-items-center text-[10px] font-semibold shrink-0">
                        {initials}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] text-n900 font-medium truncate">
                          {r.poc_name}
                        </span>
                        <span className="block text-[10.5px] text-n500 capitalize truncate">
                          {role.replace(/_/g, " ")}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test allocation
// ─────────────────────────────────────────────────────────────────────────────

function TestAllocationPanel() {
  const { data: domains = [] } = useDomains();
  const { data: pocs = [] } = usePocRegistry();
  const { data: allMappings = [] } = useAllPocDomainMappings();

  const [open, setOpen] = useState(false);
  const [domainSlug, setDomainSlug] = useState("");
  const [companyName, setCompanyName] = useState("Test Co");
  const [roleTitle, setRoleTitle] = useState("Test Role");
  const [jdText, setJdText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AllocationResult | null>(null);

  const domainOpts = useMemo(
    () =>
      (domains as any[]).map(d => ({
        slug: String(d.slug || d.name).toLowerCase(),
        name: String(d.name),
      })),
    [domains],
  );

  const run = () => {
    setError(null);
    setResult(null);
    const slug = domainSlug || domainOpts[0]?.slug;
    const name = domainOpts.find(d => d.slug === slug)?.name;
    if (!name) {
      setError("Pick a domain first.");
      return;
    }
    const pool = pocs
      .filter(p => p.availability !== "deactivated" && p.availability !== "on_leave")
      .map(toPocCapability);

    const mappings: AllocationMapping[] = (allMappings as any[])
      .filter(m => (m.domain_slug || "").toLowerCase() === slug && m.is_active)
      .map(m => ({
        domain_slug: m.domain_slug,
        poc_id: m.poc_id,
        poc_name: m.poc_name,
        priority: m.priority,
        is_active: m.is_active,
      }));

    try {
      const res = allocatePoc(
        {
          companyName,
          roleTitle,
          processDomain: name,
          jdText: jdText.trim() || null,
        },
        pool,
        mappings,
      );
      setResult(res);
    } catch (e: any) {
      const msg =
        e?.message === "MISSING_DOMAIN"
          ? "Domain is required."
          : e?.message === "NO_POCS_LOADED"
            ? "No POCs loaded — check the registry."
            : e?.message ?? "Allocation failed.";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <section className="rounded-2xl bg-card border border-n200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3 border-b border-n200 bg-n50/60 flex items-center justify-between"
      >
        <div className="text-left">
          <h4 className="text-[14px] font-medium text-n900">Test allocation</h4>
          <p className="text-[11px] text-n500">
            Simulate a process and see which POC the engine would pick.
          </p>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 text-n500 transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-5">
              {/* Inputs */}
              <div className="space-y-3">
                <Field label="Domain">
                  <div className="relative">
                    <select
                      value={domainSlug}
                      onChange={e => setDomainSlug(e.target.value)}
                      className="w-full appearance-none pl-3 pr-7 py-1.5 text-[12.5px] rounded-md border border-n300 bg-card focus:outline-none focus:ring-1 focus:ring-orange-400"
                    >
                      <option value="">— select domain —</option>
                      {domainOpts.map(d => (
                        <option key={d.slug} value={d.slug}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="h-3 w-3 text-n500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Company">
                    <input
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[12.5px] rounded-md border border-n300 bg-card focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                  </Field>
                  <Field label="Role">
                    <input
                      value={roleTitle}
                      onChange={e => setRoleTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[12.5px] rounded-md border border-n300 bg-card focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                  </Field>
                </div>
                <Field label="JD text (optional)">
                  <textarea
                    value={jdText}
                    onChange={e => setJdText(e.target.value)}
                    rows={4}
                    placeholder="Paste a job description to trigger Path B scoring…"
                    className="w-full px-2.5 py-1.5 text-[12.5px] rounded-md border border-n300 bg-card focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none"
                  />
                </Field>
                <button
                  onClick={run}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium rounded-md px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white transition-colors"
                >
                  <Play className="h-3.5 w-3.5" /> Run allocation
                </button>
                {error && (
                  <p className="text-[12px] text-coral-600">{error}</p>
                )}
              </div>

              {/* Output */}
              <div className="rounded-md border border-n200 bg-n50/40 p-4 min-h-[180px]">
                {!result ? (
                  <p className="text-[12px] text-n500 italic">
                    Run the simulator to see the picked POC and reasoning.
                  </p>
                ) : (
                  <AllocationResultView result={result} />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10.5px] uppercase tracking-[0.5px] font-medium text-n500 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function ConfidencePill({ value }: { value: number }) {
  const tone =
    value >= 75 ? "bg-sage-50 text-sage-700 border-sage-200"
    : value >= 50 ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-coral-50 text-coral-700 border-coral-200";
  return (
    <span className={cn("inline-flex items-center text-[10px] uppercase tracking-[0.5px] font-medium rounded-full px-2 py-[1px] border tabular-nums", tone)}>
      Confidence {value}
    </span>
  );
}

function TierPill({ tier }: { tier: "primary" | "secondary" | "cross" }) {
  const map = {
    primary: { label: "Primary", cls: "bg-sage-50 text-sage-700 border-sage-200" },
    secondary: { label: "Secondary", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    cross: { label: "Cross-Domain", cls: "bg-coral-50 text-coral-700 border-coral-200" },
  }[tier];
  return (
    <span className={cn("inline-flex items-center text-[10px] uppercase tracking-[0.5px] font-medium rounded-full px-2 py-[1px] border", map.cls)}>
      {map.label}
    </span>
  );
}

function AllocationResultView({ result }: { result: AllocationResult }) {
  const sb = result.prep.scoreBreakdown;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center text-[10.5px] uppercase tracking-[0.5px] font-medium rounded-full px-2 py-[2px] bg-purple-50 text-purple-700 border border-purple-200">
          {PATH_LABELS[result.path]}
        </span>
        <span className="text-[11.5px] text-n500">{PATH_DESCRIPTIONS[result.path]}</span>
      </div>

      {result.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.tags.map(t => (
            <span
              key={t}
              className={cn(
                "inline-flex items-center text-[10px] uppercase tracking-[0.5px] font-medium rounded-full px-2 py-[1px] border",
                TAG_STYLES[t],
              )}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="rounded-md bg-card border border-n200 p-3">
        <div className="text-[10.5px] uppercase tracking-[0.5px] text-n500 font-medium mb-1.5">
          Assigned Prep POC
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="h-7 w-7 rounded-full bg-n900 text-white grid place-items-center text-[10px] font-semibold">
            {result.prep.initials}
          </span>
          <span className="text-[13px] text-n900 font-medium">{result.prep.name}</span>
          <TierPill tier={result.prep.domainTier} />
          <ConfidencePill value={result.prep.confidence} />
        </div>
        {sb && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5 text-center">
            {(["domain", "expertise", "load", "fairness", "underutilizedBoost", "final"] as const).map(k => {
              const v = (sb as any)[k];
              if (v == null) return null;
              const label = k === "underutilizedBoost" ? "boost" : k;
              return (
                <div key={k} className="rounded border border-n200 bg-n50 px-1.5 py-1">
                  <div className="text-[9.5px] uppercase tracking-[0.5px] text-n500">{label}</div>
                  <div className="text-[12px] font-semibold text-n900 tabular-nums">
                    {Math.round(v)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {result.supportSuggestions.length > 0 && (
        <div className="rounded-md bg-card border border-n200 p-3">
          <div className="text-[10.5px] uppercase tracking-[0.5px] text-n500 font-medium mb-1.5">
            Suggested Support POCs
          </div>
          <ul className="space-y-1.5">
            {result.supportSuggestions.map(s => (
              <li key={s.name} className="flex items-center gap-2 flex-wrap">
                <span className="h-6 w-6 rounded-full bg-indigo-200 text-indigo-800 grid place-items-center text-[9px] font-semibold">
                  {s.initials}
                </span>
                <span className="text-[12.5px] text-n900 font-medium">{s.name}</span>
                <TierPill tier={s.domainTier} />
                <ConfidencePill value={s.confidence} />
                <span className="text-[11px] text-n500 tabular-nums ml-auto">
                  load {s.currentLoad}/{s.maxThreshold} · score {Math.round(s.scoreBreakdown?.final ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="text-[10.5px] uppercase tracking-[0.5px] text-n500 font-medium mb-1">
          Why this POC?
        </div>
        <p className="text-[12px] text-n700 leading-snug">{result.allocationReason}</p>
      </div>

      {result.alternatives.length > 0 && (
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.5px] text-n500 font-medium mb-1">
            Alternatives considered
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.alternatives.slice(0, 5).map(alt => (
              <span
                key={alt.poc.name}
                className="inline-flex items-center gap-1 text-[11.5px] rounded-full border border-n200 bg-card text-n700 px-2 py-[2px]"
              >
                <span className="h-4 w-4 rounded-full bg-n200 text-n700 grid place-items-center text-[8.5px] font-semibold">
                  {alt.poc.initials}
                </span>
                {alt.poc.name}
                <span className="text-n400">
                  · {alt.poc.domainTier} · {Math.round(alt.poc.scoreBreakdown?.final ?? 0)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
