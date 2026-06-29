import { describe, expect, it } from "vitest";
import {
  mergeHeatmapAssignmentLinks,
  resolvePlacedStudentIdsOnLmp,
  effectiveStatusBucketForStudentLmp,
  isCandidateInConvertedPipeline,
  buildSessionCountsByPocStudent,
} from "@/lib/prepPocHeatmapSources";
import type { CandidateRaw, LinkRaw } from "@/lib/prepPocHeatmapAgg";

describe("mergeHeatmapAssignmentLinks", () => {
  it("adds synthetic prep/support links from lmp_processes ids", () => {
    const links: LinkRaw[] = [];
    const processes = [{
      id: "lmp1",
      status: "prep-ongoing",
      prep_poc_id: "p1",
      support_poc_id: "p2",
      company: "Acme",
      role: "SDE",
    }];
    const merged = mergeHeatmapAssignmentLinks(links, processes);
    expect(merged).toHaveLength(2);
    expect(merged.map((l) => `${l.poc_id}:${l.role}`).sort()).toEqual(["p1:prep", "p2:support"]);
  });
});

describe("resolvePlacedStudentIdsOnLmp", () => {
  it("counts only candidates in the pipeline Converted box", () => {
    const candidates: CandidateRaw[] = [
      { lmp_id: "lmp1", student_id: "s1", pipeline_stage: "converted" },
      { lmp_id: "lmp1", student_id: "s2", pipeline_stage: "r2" },
      {
        lmp_id: "lmp1",
        student_id: "s3",
        pipeline_stage: "r1",
        students: { placement_status: "Placed" },
      },
    ];
    expect([...resolvePlacedStudentIdsOnLmp(candidates)]).toEqual(["s1"]);
  });

  it("does not count all candidates when only LMP status would be converted", () => {
    const candidates: CandidateRaw[] = [
      { lmp_id: "lmp1", student_id: "s1", pipeline_stage: "r2" },
      { lmp_id: "lmp1", student_id: "s2", pipeline_stage: "pool" },
    ];
    expect(resolvePlacedStudentIdsOnLmp(candidates).size).toBe(0);
  });

  it("counts converted candidates on prep-ongoing LMPs", () => {
    const placed = resolvePlacedStudentIdsOnLmp([
      { lmp_id: "lmp1", student_id: "s1", pipeline_stage: "converted" },
    ]);
    expect([...placed]).toEqual(["s1"]);
  });
});

describe("effectiveStatusBucketForStudentLmp", () => {
  it("uses pipeline converted, not global placement_status", () => {
    expect(
      effectiveStatusBucketForStudentLmp("prepOngoing", {
        lmp_id: "l1",
        student_id: "s1",
        pipeline_stage: "r2",
        students: { placement_status: "Placed" },
      }),
    ).toBe("prepOngoing");
  });

  it("maps converted LMP with non-converted candidate to prep ongoing", () => {
    expect(
      effectiveStatusBucketForStudentLmp("converted", {
        lmp_id: "l1",
        student_id: "s1",
        pipeline_stage: "r2",
      }),
    ).toBe("prepOngoing");
  });

  it("returns converted when candidate is in Converted box", () => {
    expect(
      effectiveStatusBucketForStudentLmp("prepDone", {
        lmp_id: "l1",
        student_id: "s1",
        pipeline_stage: "converted",
      }),
    ).toBe("converted");
  });
});

describe("isCandidateInConvertedPipeline", () => {
  it("matches pipeline stage aliases used by the LMP UI", () => {
    expect(isCandidateInConvertedPipeline({ lmp_id: "l1", student_id: "s1", pipeline_stage: "offer" })).toBe(true);
    expect(isCandidateInConvertedPipeline({ lmp_id: "l1", student_id: "s1", pipeline_stage: "r2" })).toBe(false);
  });
});

describe("buildSessionCountsByPocStudent", () => {
  it("counts completed sessions per poc/student", () => {
    const pocLinkIndex = new Map([
      ["p1", { prepIds: new Set(["lmp1"]), supportIds: new Set<string>() }],
    ]);
    const counts = buildSessionCountsByPocStudent(
      [{ lmp_id: "lmp1", student_id: "s1", status: "completed", completed_at: "2026-01-01" }],
      pocLinkIndex,
    );
    expect(counts.get("p1")?.get("s1")).toBe(1);
  });
});
