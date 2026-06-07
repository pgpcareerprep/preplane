/**
 * Standalone mentor-matching orchestrator used by the "Run Mentor" modal
 * on /mentors. Reuses the same scoring pipeline as the LMP MentorsTab via
 * `@/lib/mentorPipeline` so results stay consistent.
 *
 * Adds two extra "always-on" candidate buckets:
 *   - Previously aligned mentors (`lmp_mentors`)
 *   - Mentors who have conducted sessions (`sessions`)
 * Both are tagged via `extraTags` so they surface as badges in the result UI.
 */
import { supabase } from "@/integrations/supabase/client";
import { SKIP_EXT_THRESHOLD } from "@/lib/config/thresholds";
import type { Mentor, MentorSource } from "@/lib/mentor";
import { getScoringWeights } from "@/lib/scoringWeights";
import {
  fetchExternalMentors, generateExternalQueries, setExternalSearchContext,
} from "@/lib/externalMentors";
import { getExternalDiscoveryConfig } from "@/lib/externalDiscoveryConfig";
import { extractSkillsFromText, extractSeniority } from "@/lib/jdStore";
import {
  normaliseDbMentor, normaliseExternal, normaliseALU,
  runPipeline,
  type ScoringCandidate, type MatchMode,
} from "@/lib/mentorPipeline";
import type { ALUMentor } from "@/lib/alumniStore";

export type RunMentorInput = {
  jdText?: string;
  selectedSkills: string[];
  role: string;
  company: string;
  industry: string;
  seniority?: string;
  sources: MentorSource[];           // ["MU","ALU","EXT"]
  matchMode: MatchMode;
};

export type RunMentorStepId = "MU" | "ALU" | "EXT" | "PRIOR" | "RANK";

export type RunMentorResult = {
  suggested: Mentor[];
  counts: { MU: number; ALU: number; EXT: number; prior: number; aligned: number };
};

export async function runMentorMatch(
  input: RunMentorInput,
  ctx: {
    allMentors: any[];                       // from useAllMentors
    alumniMentors: ALUMentor[];              // from useAlumniMentors
    onStep?: (id: RunMentorStepId) => void;
    onError?: (msg: string) => void;
  },
): Promise<RunMentorResult> {
  const cfg = getExternalDiscoveryConfig();
  const wantMU = input.sources.includes("MU");
  const wantALU = input.sources.includes("ALU");
  // EXT respects user's explicit toggle. The local cfg flags only gate
  // platform fan-out inside the edge function — they must NOT silently
  // disable EXT when the user picked it.
  const wantEXT = input.sources.includes("EXT");


  // ── Derive JD info ──
  let jdSkills = input.selectedSkills.slice();
  let jdSeniority = input.seniority || "Mid";
  if (input.jdText && input.jdText.trim()) {
    jdSkills = Array.from(new Set([...jdSkills, ...extractSkillsFromText(input.jdText)]));
    if (!input.seniority) jdSeniority = extractSeniority(input.jdText);
  }
  const jdInfo = {
    jdSkills,
    jdRole: input.role || "",
    jdSeniority,
    jdCompany: input.company || "",
    jdIndustry: input.industry || "",
    gapSkills: [] as string[],
  };

  const raw: ScoringCandidate[] = [];

  // ── MU + ALU (synchronous, from already-loaded mentors) ──
  if (wantMU) {
    ctx.onStep?.("MU");
    const muRows = ctx.allMentors.filter((m: any) => (m.source || "MU") === "MU");
    raw.push(...muRows.map(normaliseDbMentor));
  }
  if (wantALU) {
    ctx.onStep?.("ALU");
    raw.push(...ctx.alumniMentors.map(normaliseALU));
  }

  // ── External AI discovery + Prior-session lookup, in PARALLEL ──
  // Skip-by-threshold only applies when the user picked local sources too.
  // EXT-only runs must always execute external discovery.
  const onlyExt = wantEXT && !wantMU && !wantALU;
  const shouldRunExt = wantEXT && (onlyExt || raw.length < SKIP_EXT_THRESHOLD);


  const extRole = jdInfo.jdRole || jdInfo.jdSkills[0] || "";

  const extPromise: Promise<ScoringCandidate[]> = (shouldRunExt && extRole)
    ? (async () => {
        ctx.onStep?.("EXT");
        try {
          setExternalSearchContext({
            role: extRole,
            company: jdInfo.jdCompany,
            industry: jdInfo.jdIndustry,
            skills: jdInfo.jdSkills,
            seniority: jdInfo.jdSeniority,
            jdText: input.jdText,
          });

          const queries = generateExternalQueries({
            role: extRole,
            company: jdInfo.jdCompany,
            industry: jdInfo.jdIndustry,
            required_skills: jdInfo.jdSkills,
            seniority_level: jdInfo.jdSeniority,
          });
          const res = await fetchExternalMentors(queries, cfg);
          const mentors = res.mentors;
          const counts = ["LinkedIn", "Topmate", "ADPList", "Superpeer"]
            .map((p) => `${p} ${mentors.filter((m) => m.platform === p).length}`)
            .join(" · ");
          if (res.errors.length) {
            const fatal = res.errors.find((e) => !e.recoverable);
            if (fatal || mentors.length === 0) ctx.onError?.(`${counts} (${res.errors.slice(0, 2).map((e) => e.message).join("; ")})`);
          } else if (mentors.length === 0) {
            ctx.onError?.(`External discovery found 0 mentors across ${counts}.`);
          }
          return mentors.map(normaliseExternal);
        } catch (e) {
          ctx.onError?.(e instanceof Error ? e.message : String(e));
          return [];
        }
      })()
    : Promise.resolve([]);

  const priorPromise = (async () => {
    ctx.onStep?.("PRIOR");
    const alignedIds = new Set<string>();
    const priorSessionCounts = new Map<string, number>();
    try {
      const [alignedRes, sessionRes] = await Promise.all([
        supabase
          .from("lmp_mentors")
          .select("mentor_id, status")
          .not("status", "in", '("removed","cancelled")'),
        supabase
          .from("sessions")
          .select("mentor_id, status")
          .in("status", ["completed", "done"]),
      ]);
      if (!alignedRes.error && alignedRes.data) {
        alignedRes.data.forEach((r: any) => r.mentor_id && alignedIds.add(r.mentor_id));
      }
      if (!sessionRes.error && sessionRes.data) {
        sessionRes.data.forEach((r: any) => {
          if (!r.mentor_id) return;
          priorSessionCounts.set(r.mentor_id, (priorSessionCounts.get(r.mentor_id) || 0) + 1);
        });
      }
    } catch (e) {
      // Non-fatal — proceed without prior-session boost.
    }
    return { alignedIds, priorSessionCounts };
  })();

  const [extCandidates, { alignedIds, priorSessionCounts }] = await Promise.all([extPromise, priorPromise]);
  // Record raw EXT count BEFORE deduplication so the source counter is accurate
  // even when EXT mentors overlap with existing MU/ALU entries (and get absorbed).
  const rawExtCount = extCandidates.length;
  raw.push(...extCandidates);

  // Surface "EXT requested but returned 0" so the UI can show a banner.
  if (wantEXT && shouldRunExt && rawExtCount === 0) {
    ctx.onError?.("External discovery returned no usable results after platform search and scoring. Try a clearer role or add company/industry context.");
  }


  // Tag any existing candidates and pull in any missing mentors from
  // ctx.allMentors that are aligned / have prior sessions.
  // IMPORTANT: only INJECT new local mentors when MU/ALU sources are selected.
  // For EXT-only runs we still tag overlapping EXT results, but never add MU rows.
  const byId = new Map(raw.map((c) => [c.id, c]));
  const ensure = (id: string) => {
    if (byId.has(id)) return byId.get(id)!;
    if (!wantMU && !wantALU) return null;
    const row = ctx.allMentors.find((m: any) => m.id === id);
    if (!row) return null;
    const rowSource = (row.source || "MU") as MentorSource;
    if (rowSource === "MU" && !wantMU) return null;
    if (rowSource === "ALU" && !wantALU) return null;
    const c = normaliseDbMentor(row);
    raw.push(c);
    byId.set(id, c);
    return c;
  };
  let priorBucket = 0, alignedBucket = 0;
  alignedIds.forEach((id) => {
    const c = ensure(id);
    if (!c) return;
    alignedBucket++;
    c.extraTags = [...(c.extraTags ?? []), { emoji: "🔗", label: "Previously aligned" }];
  });
  priorSessionCounts.forEach((n, id) => {
    const c = ensure(id);
    if (!c) return;
    priorBucket++;
    c.extraTags = [...(c.extraTags ?? []), { emoji: "🎙️", label: `Prior sessions · ${n}` }];
    c.sessions_taken = (c.sessions_taken ?? 0) + n;
  });

  // ── Rank ──
  ctx.onStep?.("RANK");
  const suggested = runPipeline(raw, jdInfo, getScoringWeights(), input.matchMode);


  return {
    suggested,
    counts: {
      MU: suggested.filter((m) => m.source === "MU").length,
      ALU: suggested.filter((m) => m.source === "ALU").length,
      // Use raw pre-dedup count: EXT candidates absorbed into MU/ALU still
      // represent valid external discoveries and should be counted.
      EXT: wantEXT ? rawExtCount : 0,
      prior: priorBucket,
      aligned: alignedBucket,
    },
  };
}
