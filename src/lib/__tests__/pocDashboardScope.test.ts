import { describe, it, expect } from "vitest";
import { scopeProcessesToOperationalPoc, type Process } from "@/lib/lmpProcessQueries";

function makeProcess(overrides: Partial<Process> = {}): Process {
  return {
    processId: "proc-1",
    dateCreated: "2025-01-01T00:00:00Z",
    company: "Acme",
    role: "PM",
    domain: "Consulting",
    type: "Full-Time",
    status: "Ongoing",
    offerOutcome: "",
    prepProgress: 40,
    placementProgress: "Prep",
    r1Shortlisted: "",
    r2Shortlisted: "",
    r3Shortlisted: "",
    finalConvert: "",
    convertNames: "",
    prepDoc: "",
    mentorAligned: "No",
    prepPoc: "Vidit Sinha",
    supportPoc: "",
    outreachPoc: "",
    lastUpdated: "2025-06-01T00:00:00Z",
    closingDate: "",
    closedReason: "",
    displayStatus: "Ongoing",
    filterStatus: "ongoing",
    filterType: "Full-Time",
    filterDomain: "Consulting",
    ...overrides,
  };
}

describe("scopeProcessesToOperationalPoc", () => {
  it("falls back to prep/support name when active link map is empty", () => {
    const rows = [makeProcess({ processId: "a" }), makeProcess({ processId: "b", prepPoc: "Other POC" })];
    const activeMap = new Map<string, Set<string>>([["poc-uuid", new Set()]]);

    const scoped = scopeProcessesToOperationalPoc(rows, "poc-uuid", "Vidit Sinha", activeMap);

    expect(scoped.map((r) => r.processId)).toEqual(["a"]);
  });

  it("falls back to name when poc id is missing from active link map", () => {
    const rows = [makeProcess({ processId: "a", supportPoc: "Vidit Sinha", prepPoc: "" })];
    const activeMap = new Map<string, Set<string>>();

    const scoped = scopeProcessesToOperationalPoc(rows, "unknown-uuid", "Vidit Sinha", activeMap);

    expect(scoped.map((r) => r.processId)).toEqual(["a"]);
  });

  it("includes rows from active link map even without name match", () => {
    const rows = [makeProcess({ processId: "linked", prepPoc: "", supportPoc: "" })];
    const activeMap = new Map<string, Set<string>>([["poc-uuid", new Set(["linked"])]]);

    const scoped = scopeProcessesToOperationalPoc(rows, "poc-uuid", "Vidit Sinha", activeMap);

    expect(scoped.map((r) => r.processId)).toEqual(["linked"]);
  });
});
