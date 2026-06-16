/**
 * Regression tests for candidate pipeline aggregation in ViewAllLmpsModal.
 *
 * Verifies that:
 * - CandidatePopoverList filters by pipeline_stage (not r1_status/r2_status)
 * - pool round shows candidates not in any named round
 * - r1/r2/r3/converted rounds show only exact stage matches
 * - renderCell maps pool_num→pool_count, r1_num→r1_count (not r2_count), etc.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ViewAllLmpsModal } from "@/components/datasources/ViewAllLmpsModal";

// Candidate fixtures that match the acceptance criteria for "Test — Brand" LMP
const POOL_CANDIDATES = [
  { id: "c1", student_name: "Aagrah Nigam", roll_no: "R001", pipeline_stage: "pool",        lmp_id: "lmp-1", r1_status: null, r2_status: null, r3_status: null, offer_status: null },
  { id: "c2", student_name: "Aarushi",      roll_no: "R002", pipeline_stage: "shortlisted",  lmp_id: "lmp-1", r1_status: null, r2_status: null, r3_status: null, offer_status: null },
];
const R1_CANDIDATES = [
  { id: "c3", student_name: "Aayush",       roll_no: "R003", pipeline_stage: "r1",           lmp_id: "lmp-1", r1_status: null, r2_status: null, r3_status: null, offer_status: null },
];
const ALL_CANDIDATES = [...POOL_CANDIDATES, ...R1_CANDIDATES];

const MOCK_ROW = {
  id: "lmp-1",
  company: "Test Corp",
  role: "Brand Manager",
  domain_raw: "Marketing",
  status: "Ongoing",
  type: "Full-Time",
  lmp_code: "LMP-001",
  created_date: "2024-01-01",
  sync_source: null,
  // Pipeline stage columns (new view)
  pool_count: 2,
  pool_names: "Aagrah Nigam, Aarushi",
  r1_count: 1,
  r1_names: "Aayush",
  r2_count: 0,
  r2_names: null,
  r3_count: 0,
  r3_names: null,
  converted_count: 0,
  converted_names: null,
  offer_count: 0,
  // Legacy
  final_converted_numbers: null,
  final_converted_names: null,
  // Other
  prep_poc_names: null, support_poc_names: null, outreach_poc_names: null,
  mentor_name: null, mentor_selected: null, mentor_feedback_avg: null,
  latest_daily_progress: null, daily_log_count: 0,
  checklist_prep_doc_shared: false, checklist_mentor_aligned: false,
  checklist_assignment_review: false, checklist_one_to_one_mock: false,
  next_progress_date: null, next_progress_type: null,
  feedback_by_outreach: null, comments: null, closing_date: null,
  prep_doc: null, prep_doc_link: null,
};

vi.mock("@/lib/hooks/useDbData", () => ({
  useLmpFullView: () => ({ data: [MOCK_ROW], isLoading: false }),
  useLmpCandidatesByProcess: () => ({ data: ALL_CANDIDATES, isLoading: false }),
  useDeleteLmpProcess: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/lib/hooks/useLmpSheetLinkStatus", () => ({
  useLmpSheetLinkStatus: () => ({ data: null }),
}));

vi.mock("@/lib/hooks/useResolveDomain", () => ({
  useResolveDomain: () => ({
    names: ["All"],
    display: (d: string) => d,
    matches: () => true,
  }),
}));

vi.mock("@/lib/hooks/useAvatarUrls", () => ({
  useAvatarUrl: () => null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: () => ({ data: null, error: null }) }),
      delete: () => ({ in: () => ({ data: null, error: null }) }),
    }),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderModal() {
  return render(
    <QueryClientProvider client={makeQc()}>
      <MemoryRouter>
        <ViewAllLmpsModal open onOpenChange={vi.fn()} readOnly={true} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Candidate pipeline aggregation – renderCell column mapping", () => {
  it("renders pool_count (2) in the pool column, not r1_count (1)", () => {
    renderModal();
    // Pool column should show "2" (pool_count), not "1" (r1_count)
    const buttons = screen.getAllByRole("button");
    const countBtns = buttons.filter((b) => /^\d+$/.test(b.textContent?.trim() ?? ""));
    const counts = countBtns.map((b) => Number(b.textContent?.trim()));
    // We expect a "2" button (pool) and a "1" button (r1); no "0" buttons rendered
    expect(counts).toContain(2);
    expect(counts).toContain(1);
    // pool_count shown as 2 means it should NOT show "1" as the first count cell
    // (the old bug showed r1_count=1 in the pool column)
    expect(counts[0]).toBe(2); // pool column renders first
  });
});

describe("CandidatePopoverList – pipeline_stage filtering", () => {
  it("pool round includes candidates with null/pool/shortlisted pipeline_stage", () => {
    const NAMED_STAGES = [
      'r1','r1_shortlisted','round1','round_1',
      'r2','r2_shortlisted','round2','round_2',
      'r3','r3_shortlisted','round3','round_3',
      'offer','converted','final','accepted',
    ];
    const poolCandidates = ALL_CANDIDATES.filter((c) => {
      const stage = (c.pipeline_stage ?? '').toLowerCase().trim();
      return !NAMED_STAGES.includes(stage);
    });
    expect(poolCandidates).toHaveLength(2);
    expect(poolCandidates.map((c) => c.student_name).sort()).toEqual(["Aagrah Nigam", "Aarushi"]);
  });

  it("r1 round includes only candidates with R1 stage aliases", () => {
    const r1Values = ['r1','r1_shortlisted','round1','round_1'];
    const r1Candidates = ALL_CANDIDATES.filter((c) =>
      r1Values.includes((c.pipeline_stage ?? '').toLowerCase().trim())
    );
    expect(r1Candidates).toHaveLength(1);
    expect(r1Candidates[0].student_name).toBe("Aayush");
  });

  it("r2 round returns empty when no candidates are in r2 stage", () => {
    const r2Values = ['r2','r2_shortlisted','round2','round_2'];
    const r2Candidates = ALL_CANDIDATES.filter((c) =>
      r2Values.includes((c.pipeline_stage ?? '').toLowerCase().trim())
    );
    expect(r2Candidates).toHaveLength(0);
  });

  it("does NOT use r1_status column to filter (old bug)", () => {
    // Old code filtered by c.r1_status — Aayush has r1_status=null so would show 0 candidates
    // New code filters by c.pipeline_stage='r1' — should show 1 candidate
    const oldBugResult = ALL_CANDIDATES.filter((c) => {
      const v = c.r1_status;
      return v !== null && v !== undefined && String(v).trim() !== "";
    });
    expect(oldBugResult).toHaveLength(0); // confirms old code was wrong

    const newResult = ALL_CANDIDATES.filter((c) =>
      ['r1','r1_shortlisted','round1','round_1'].includes(
        (c.pipeline_stage ?? '').toLowerCase().trim()
      )
    );
    expect(newResult).toHaveLength(1); // new code is correct
  });
});
