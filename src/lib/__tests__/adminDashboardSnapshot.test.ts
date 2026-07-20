import { describe, expect, it } from "vitest";
import { parseAdminDashboardSnapshot } from "@/lib/hooks/useAdminDashboardSnapshot";

describe("parseAdminDashboardSnapshot", () => {
  it("maps snake_case RPC payload into dashboard shapes", () => {
    const parsed = parseAdminDashboardSnapshot({
      students: [{
        id: "s1",
        email: "a@b.com",
        name: " Ada ",
        cohort_id: "c1",
        program_id: "p1",
        primary_domain: "Sales",
        active_lmp_count: 2,
        placement_status: "active",
      }],
      lmp_processes: [{ id: "l1", company: "Acme" }],
      candidates: [{
        id: "cand1",
        lmp_id: "l1",
        student_name: "Ada",
        pipeline_stage: "r1",
      }],
      cohorts: [{ id: "c1", code: "C6", name: "Cohort 6" }],
      programs: [{ id: "p1", code: "TBM", name: "TBM", cohort_id: "c1" }],
      prep_poc_capacity: [{ name: "Radhika", active: 3, has_domain: true }],
    });

    expect(parsed.students[0].name).toBe("Ada");
    expect(parsed.students[0].activeLmpCount).toBe(2);
    expect(parsed.candidates[0].lmpId).toBe("l1");
    expect(parsed.prep_poc_capacity[0]).toEqual({ name: "Radhika", active: 3, hasDomain: true });
  });
});
