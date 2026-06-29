import { describe, expect, it } from "vitest";
import {
  mergeHeatmapAssignmentLinks,
  resolvePlacedStudentIdsOnLmp,
  effectiveStatusBucketForStudentLmp,
  buildSessionCountsByPocStudent,
} from "@/lib/prepPocHeatmapSources";
import type { CandidateRaw, LinkRaw } from "@/lib/prepPocHeatmapAgg";
import { mapStatusToBucket } from "@/lib/prepPocHeatmapAgg";

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
  it("counts pipeline converted even when LMP is prep-done", () => {
    const candidates: CandidateRaw[] = [{
      lmp_id: "lmp1",
      student_id: "s1",
      pipeline_stage: "converted",
      students: { name: "Sam" },
    }];
    const placed = resolvePlacedStudentIdsOnLmp(
      mapStatusToBucket("prep-done"),
      { status: "prep-done", final_converted_names: null },
      candidates,
      new Map([["sam", "s1"]]),
    );
    expect([...placed]).toEqual(["s1"]);
  });

  it("matches final_converted_names to roster ids", () => {
    const placed = resolvePlacedStudentIdsOnLmp(
      "converted",
      { status: "converted", final_converted_names: "Aarushi" },
      [],
      new Map([["aarushi", "s9"]]),
    );
    expect([...placed]).toEqual(["s9"]);
  });
});

describe("effectiveStatusBucketForStudentLmp", () => {
  it("prefers converted pipeline stage", () => {
    expect(
      effectiveStatusBucketForStudentLmp("prepDone", {
        lmp_id: "l1",
        student_id: "s1",
        pipeline_stage: "converted",
      }),
    ).toBe("converted");
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
