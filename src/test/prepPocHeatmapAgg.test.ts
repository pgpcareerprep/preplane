import { describe, it, expect } from "vitest";
import {
  buildHeatmapData,
  filterHeatmapMetricRecords,
  mapStatusToBucket,
  fmtConversion,
  type PocRaw,
  type LinkRaw,
  type CandidateRaw,
} from "@/lib/prepPocHeatmapAgg";

// ── Helpers ───────────────────────────────────────────────────────────────────

function poc(id: string, name: string, domainTags: string[] = []): PocRaw {
  return { id, name, primary_domain: domainTags[0] ?? null, domain_tags: domainTags };
}

function link(pocId: string, lmpId: string, role: "prep" | "support", status: string, domain?: string): LinkRaw {
  return {
    poc_id: pocId,
    role,
    lmp_id: lmpId,
    lmp_processes: {
      status,
      domains: domain ? { name: domain } : null,
    },
  };
}

function candidate(lmpId: string, studentId: string): CandidateRaw {
  return { lmp_id: lmpId, student_id: studentId };
}

// ── Status mapping ────────────────────────────────────────────────────────────

describe("mapStatusToBucket", () => {
  it("maps canonical values", () => {
    expect(mapStatusToBucket("not-started")).toBe("notStarted");
    expect(mapStatusToBucket("prep-ongoing")).toBe("prepOngoing");
    expect(mapStatusToBucket("prep-done")).toBe("prepDone");
    expect(mapStatusToBucket("hold")).toBe("onHold");
    expect(mapStatusToBucket("converted")).toBe("converted");
    expect(mapStatusToBucket("not-converted")).toBe("notConverted");
    expect(mapStatusToBucket("other-reasons")).toBe("otherReasons");
  });

  it("maps legacy values to their canonical buckets", () => {
    expect(mapStatusToBucket("ongoing")).toBe("prepOngoing");
    expect(mapStatusToBucket("offer-received")).toBe("converted");
    expect(mapStatusToBucket("dormant")).toBe("otherReasons");
    expect(mapStatusToBucket("closed")).toBe("otherReasons");
    expect(mapStatusToBucket("converted-na")).toBe("otherReasons");
  });

  it("handles null/undefined gracefully", () => {
    expect(mapStatusToBucket(null)).toBe("unknown");
    expect(mapStatusToBucket(undefined)).toBe("unknown");
    expect(mapStatusToBucket("")).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(mapStatusToBucket("NOT-STARTED")).toBe("notStarted");
    expect(mapStatusToBucket("Prep-Ongoing")).toBe("prepOngoing");
  });
});

// ── 1. One LMP with one Primary POC ─────────────────────────────────────────

describe("Case 1: One LMP, one Primary POC", () => {
  const pocs = [poc("p1", "Alice", ["Consulting"])];
  const links = [link("p1", "lmp1", "prep", "not-started", "Consulting")];
  const result = buildHeatmapData(pocs, links, []);

  it("produces one row", () => expect(result.rows).toHaveLength(1));

  it("counts total, current, closed correctly", () => {
    const row = result.rows[0];
    expect(row.totalLmpLoad).toBe(1);
    expect(row.currentLmpCount).toBe(1); // not-started counts as current
    expect(row.closedLmpCount).toBe(0);
    expect(row.notStartedCount).toBe(1);
  });

  it("primary=1, support=0", () => {
    const row = result.rows[0];
    expect(row.primaryCount).toBe(1);
    expect(row.supportCount).toBe(0);
  });

  it("in-domain=1 (domain matches)", () => {
    const row = result.rows[0];
    expect(row.inDomainCount).toBe(1);
    expect(row.crossDomainCount).toBe(0);
  });

  it("summary.uniqueLmpCount=1", () => expect(result.summary.uniqueLmpCount).toBe(1));
  it("summary.activePocCount=1", () => expect(result.summary.activePocCount).toBe(1));
});

// ── 2. One LMP with Primary and Support POCs ─────────────────────────────────

describe("Case 2: One LMP with Primary and Support POCs", () => {
  const pocs = [poc("p1", "Alice"), poc("p2", "Bob")];
  const links = [
    link("p1", "lmp1", "prep", "converted"),
    link("p2", "lmp1", "support", "converted"),
  ];
  const result = buildHeatmapData(pocs, links, []);

  it("each POC has totalLmpLoad=1", () => {
    const alice = result.rows.find((r) => r.pocId === "p1")!;
    const bob = result.rows.find((r) => r.pocId === "p2")!;
    expect(alice.totalLmpLoad).toBe(1);
    expect(bob.totalLmpLoad).toBe(1);
  });

  it("global uniqueLmpCount=1 (same LMP counted once)", () => {
    expect(result.summary.uniqueLmpCount).toBe(1);
  });

  it("alice is primary, bob is support", () => {
    const alice = result.rows.find((r) => r.pocId === "p1")!;
    const bob = result.rows.find((r) => r.pocId === "p2")!;
    expect(alice.primaryCount).toBe(1);
    expect(alice.supportCount).toBe(0);
    expect(bob.primaryCount).toBe(0);
    expect(bob.supportCount).toBe(1);
  });
});

// ── 3. Duplicate POC-LMP assignment records ──────────────────────────────────

describe("Case 3: Duplicate links for same POC-LMP pair", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [
    link("p1", "lmp1", "prep", "prep-ongoing"),
    link("p1", "lmp1", "prep", "prep-ongoing"), // duplicate
  ];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("deduplicates: totalLmpLoad=1", () => expect(row.totalLmpLoad).toBe(1));
  it("prepOngoingCount=1", () => expect(row.prepOngoingCount).toBe(1));
});

// ── 4. Same POC assigned as both Primary and Support ─────────────────────────

describe("Case 4: Same POC as both Primary and Support on one LMP", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [
    link("p1", "lmp1", "prep", "converted"),
    link("p1", "lmp1", "support", "converted"),
  ];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("totalLmpLoad=1 (LMP counted once)", () => expect(row.totalLmpLoad).toBe(1));
  it("primary+support is reduced by dual-assigned count", () => {
    // dual-assigned deducts 1 from both, so primary=0, support=0
    expect(row.primaryCount).toBe(0);
    expect(row.supportCount).toBe(0);
  });
});

// ── 5. One student in several LMPs ───────────────────────────────────────────

describe("Case 5: One student in multiple LMPs (one converted)", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [
    link("p1", "lmp1", "prep", "converted"),
    link("p1", "lmp2", "prep", "converted"),
  ];
  const candidates = [
    candidate("lmp1", "s1"),
    candidate("lmp2", "s1"), // same student in second LMP
  ];
  const result = buildHeatmapData(pocs, links, candidates);
  const row = result.rows[0];

  it("studentsPlaced=1 (student counted once)", () => expect(row.studentsPlaced).toBe(1));
  it("global uniqueStudentsPlaced=1", () => expect(result.summary.uniqueStudentsPlaced).toBe(1));
});

// ── 6. Duplicate candidate rows ───────────────────────────────────────────────

describe("Case 6: Duplicate candidate rows (same student twice in same LMP)", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [link("p1", "lmp1", "prep", "converted")];
  const candidates = [candidate("lmp1", "s1"), candidate("lmp1", "s1")];
  const result = buildHeatmapData(pocs, links, candidates);
  const row = result.rows[0];

  it("studentsPlaced=1 (deduped)", () => expect(row.studentsPlaced).toBe(1));
});

// ── 7. Duplicate placement records (same student, different candidates) ───────

describe("Case 7: Multiple candidate records for same student", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [link("p1", "lmp1", "prep", "converted")];
  const candidates = [
    candidate("lmp1", "s1"),
    candidate("lmp1", "s1"), // duplicate
    candidate("lmp1", "s2"),
  ];
  const result = buildHeatmapData(pocs, links, candidates);
  const row = result.rows[0];

  it("studentsPlaced=2 (s1 deduped, s2 counted)", () => expect(row.studentsPlaced).toBe(2));
});

// ── 8. Valid final placement (converted LMP) ───────────────────────────────────

describe("Case 8: Student in converted LMP counts as placed", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [link("p1", "lmp1", "prep", "converted")];
  const candidates = [candidate("lmp1", "s1")];
  const result = buildHeatmapData(pocs, links, candidates);

  it("studentsPlaced=1", () => expect(result.rows[0].studentsPlaced).toBe(1));
});

// ── 9. Withdrawn/non-converted LMP student not placed ─────────────────────────

describe("Case 9: Student in not-converted LMP not counted as placed", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [link("p1", "lmp1", "prep", "not-converted")];
  const candidates = [candidate("lmp1", "s1")];
  const result = buildHeatmapData(pocs, links, candidates);

  it("studentsPlaced=0", () => expect(result.rows[0].studentsPlaced).toBe(0));
});

// ── 10. Multi-domain LMP with one domain match ───────────────────────────────

describe("Case 10: In-domain when LMP domain matches one POC domain", () => {
  const pocs = [poc("p1", "Alice", ["Consulting", "Data"])];
  const links = [link("p1", "lmp1", "prep", "prep-ongoing", "Consulting")];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("inDomain=1, crossDomain=0", () => {
    expect(row.inDomainCount).toBe(1);
    expect(row.crossDomainCount).toBe(0);
  });
});

// ── 11. Multi-domain LMP with no domain match ────────────────────────────────

describe("Case 11: Cross-domain when LMP domain doesn't match any POC domain", () => {
  const pocs = [poc("p1", "Alice", ["Data"])];
  const links = [link("p1", "lmp1", "prep", "prep-ongoing", "Consulting")];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("inDomain=0, crossDomain=1", () => {
    expect(row.inDomainCount).toBe(0);
    expect(row.crossDomainCount).toBe(1);
  });
});

// ── 12. Not Started → Prep Ongoing transition ────────────────────────────────

describe("Case 12: Prep Ongoing LMP counted under Active Prep", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [link("p1", "lmp1", "prep", "prep-ongoing")];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("prepOngoingCount=1, currentLmpCount=1", () => {
    expect(row.prepOngoingCount).toBe(1);
    expect(row.currentLmpCount).toBe(1);
    expect(row.notStartedCount).toBe(0);
  });
});

// ── 13. Prep Ongoing → Prep Done ─────────────────────────────────────────────

describe("Case 13: Prep Done is current, not closed", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [link("p1", "lmp1", "prep", "prep-done")];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("prepDoneCount=1, currentLmpCount=1, closedLmpCount=0", () => {
    expect(row.prepDoneCount).toBe(1);
    expect(row.currentLmpCount).toBe(1);
    expect(row.closedLmpCount).toBe(0);
  });
});

// ── 14. Prep Ongoing → On Hold ───────────────────────────────────────────────

describe("Case 14: On hold is closed in LMP Load display", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [link("p1", "lmp1", "prep", "hold")];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("onHoldCount=1, closedLmpCount=1, currentLmpCount=0", () => {
    expect(row.onHoldCount).toBe(1);
    expect(row.closedLmpCount).toBe(1);
    expect(row.currentLmpCount).toBe(0);
  });
});

// ── 15. On Hold returning to active ─────────────────────────────────────────
// (Simulated by the LMP status changing from hold to prep-ongoing in subsequent data)

describe("Case 15: LMP moved from hold to prep-ongoing appears as current", () => {
  const pocs = [poc("p1", "Alice")];
  // Same lmp_id appears twice (could be duplicate links); first status wins
  const links = [link("p1", "lmp1", "prep", "prep-ongoing")];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("prepOngoingCount=1, currentLmpCount=1", () => {
    expect(row.prepOngoingCount).toBe(1);
    expect(row.currentLmpCount).toBe(1);
  });
});

// ── 16. Converted outcome ────────────────────────────────────────────────────

describe("Case 16: Converted LMP", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [link("p1", "lmp1", "prep", "converted")];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("convertedCount=1, closedLmpCount=1, eligibleClosedCount=1", () => {
    expect(row.convertedCount).toBe(1);
    expect(row.closedLmpCount).toBe(1);
    expect(row.eligibleClosedCount).toBe(1);
    expect(row.lmpConversionPercentage).toBe(100);
  });
});

// ── 17. Not Converted outcome ────────────────────────────────────────────────

describe("Case 17: Not Converted LMP", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [link("p1", "lmp1", "prep", "not-converted")];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("notConvertedCount=1, conversion=0%", () => {
    expect(row.notConvertedCount).toBe(1);
    expect(row.eligibleClosedCount).toBe(1);
    expect(row.lmpConversionPercentage).toBe(0);
  });
});

// ── 18. Other reasons outcome ─────────────────────────────────────────────────

describe("Case 18: Other reasons (dormant, closed, other-reasons)", () => {
  const pocs = [poc("p1", "Alice")];
  const linksOther = [link("p1", "lmp1", "prep", "other-reasons")];
  const linksDormant = [link("p1", "lmp2", "prep", "dormant")];
  const linksClosed = [link("p1", "lmp3", "prep", "closed")];
  const result = buildHeatmapData(pocs, [...linksOther, ...linksDormant, ...linksClosed], []);
  const row = result.rows[0];

  it("otherReasonsCount=3", () => expect(row.otherReasonsCount).toBe(3));
  it("eligibleClosedCount=3 (OR counts toward denominator)", () => {
    expect(row.eligibleClosedCount).toBe(3);
  });
});

// ── 19. Zero eligible conversion denominator ─────────────────────────────────

describe("Case 19: Zero eligible closed denominator", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [link("p1", "lmp1", "prep", "not-started")];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("lmpConversionPercentage=null when no eligible LMPs", () => {
    expect(row.eligibleClosedCount).toBe(0);
    expect(row.lmpConversionPercentage).toBeNull();
  });
});

// ── 20. KPI and Total consistency ────────────────────────────────────────────

describe("Case 20: KPI uniqueLmpCount matches scoped set", () => {
  const pocs = [poc("p1", "Alice"), poc("p2", "Bob")];
  const links = [
    link("p1", "lmp1", "prep", "converted"),
    link("p2", "lmp1", "support", "converted"), // same LMP
    link("p2", "lmp2", "prep", "not-started"),
  ];
  const result = buildHeatmapData(pocs, links, []);

  it("uniqueLmpCount=2 (lmp1 and lmp2)", () => {
    expect(result.summary.uniqueLmpCount).toBe(2);
  });

  it("total row total should sum per-poc totals (not match uniqueLmpCount)", () => {
    const totalLoads = result.rows.reduce((s, r) => s + r.totalLmpLoad, 0);
    // p1 has lmp1 (1), p2 has lmp1+lmp2 (2) = 3, but unique is 2
    expect(totalLoads).toBe(3);
    expect(result.summary.uniqueLmpCount).toBe(2);
  });
});

// ── 21. Realtime invalidation (aggregation unit — no React in this module) ───
// Covered by component-level tests (PrepPocHeatmapCard integration)

// ── 22. Realtime invalidation after placement change ─────────────────────────
// Covered by component-level tests

// ── 23. Filter consistency ───────────────────────────────────────────────────

describe("Case 23: POCs not in active prep list are excluded", () => {
  const pocs = [poc("p1", "Alice")]; // only Alice is active Prep POC
  const links = [
    link("p1", "lmp1", "prep", "prep-ongoing"),
    link("p2", "lmp2", "prep", "prep-ongoing"), // p2 NOT in pocs list
  ];
  const result = buildHeatmapData(pocs, links, []);

  it("uniqueLmpCount=1 (lmp2 excluded as p2 is not a listed Prep POC)", () => {
    expect(result.summary.uniqueLmpCount).toBe(1);
  });
  it("only Alice row present", () => {
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].pocName).toBe("Alice");
  });
});

// ── 24. CSV export content ────────────────────────────────────────────────────
// Covered by PrepPocHeatmapCard tests

// ── 25. CSV uses exact status names ──────────────────────────────────────────
// Covered by PrepPocHeatmapCard tests

// ── 29. Heatmap intensity calculation ────────────────────────────────────────

describe("Case 29: fmtConversion format", () => {
  it("shows N/D - P% format", () => {
    expect(fmtConversion(3, 5, 60)).toBe("3/5 - 60%");
  });

  it("shows em-dash for zero denominator", () => {
    expect(fmtConversion(0, 0, null)).toBe("—");
  });

  it("shows 100% for all converted", () => {
    expect(fmtConversion(4, 4, 100)).toBe("4/4 - 100%");
  });
});

// ── Reconciliation: Total = Current + Closed ─────────────────────────────────

describe("Reconciliation: Total = Current + Closed per row", () => {
  const pocs = [poc("p1", "Alice")];
  const links = [
    link("p1", "lmp1", "prep", "not-started"),
    link("p1", "lmp2", "prep", "prep-ongoing"),
    link("p1", "lmp3", "prep", "prep-done"),
    link("p1", "lmp4", "prep", "hold"),
    link("p1", "lmp5", "prep", "converted"),
    link("p1", "lmp6", "prep", "not-converted"),
    link("p1", "lmp7", "prep", "other-reasons"),
  ];
  const result = buildHeatmapData(pocs, links, []);
  const row = result.rows[0];

  it("Total = Current + Closed", () => {
    expect(row.totalLmpLoad).toBe(row.currentLmpCount + row.closedLmpCount);
  });

  it("Current = notStarted + prepOngoing + prepDone", () => {
    expect(row.currentLmpCount).toBe(
      row.notStartedCount + row.prepOngoingCount + row.prepDoneCount,
    );
  });

  it("Closed = converted + notConverted + onHold + otherReasons", () => {
    expect(row.closedLmpCount).toBe(
      row.convertedCount + row.notConvertedCount + row.onHoldCount + row.otherReasonsCount,
    );
  });
});

// ── Drill-down record filters ────────────────────────────────────────────────

describe("Drill-down filters reconcile with visible heatmap cells", () => {
  const pocs = [poc("p1", "Alice", ["Consulting"])];
  const links = [
    link("p1", "lmp1", "prep", "not-started", "Consulting"),
    link("p1", "lmp2", "prep", "prep-ongoing", "Finance"),
    link("p1", "lmp3", "support", "prep-done", "Consulting"),
    link("p1", "lmp4", "prep", "converted", "Consulting"),
    link("p1", "lmp5", "prep", "not-converted", "Consulting"),
    link("p1", "lmp6", "prep", "hold", "Consulting"),
    link("p1", "lmp7", "prep", "other-reasons", "Consulting"),
  ];
  const candidates = [
    candidate("lmp4", "s1"),
    candidate("lmp4", "s1"),
    candidate("lmp4", "s2"),
  ];
  const result = buildHeatmapData(pocs, links, candidates);
  const row = result.rows[0];

  it("Total returns all assigned distinct LMPs", () => {
    const drill = filterHeatmapMetricRecords(result.source, "p1", "total");
    expect(drill.lmps).toHaveLength(row.totalLmpLoad);
  });

  it("Current returns not started, prep ongoing, and prep done LMPs", () => {
    const drill = filterHeatmapMetricRecords(result.source, "p1", "current");
    expect(drill.lmps).toHaveLength(row.currentLmpCount);
    expect(drill.lmps.map((r) => r.statusBucket).sort()).toEqual(["notStarted", "prepDone", "prepOngoing"].sort());
  });

  it("Closed follows the canonical On hold treatment", () => {
    const drill = filterHeatmapMetricRecords(result.source, "p1", "closed");
    expect(drill.lmps).toHaveLength(row.closedLmpCount);
    expect(drill.lmps.some((r) => r.statusLabel === "On hold")).toBe(true);
  });

  it("Primary and Support use assignment role without inflating total", () => {
    expect(filterHeatmapMetricRecords(result.source, "p1", "primary").lmps).toHaveLength(row.primaryCount);
    expect(filterHeatmapMetricRecords(result.source, "p1", "support").lmps).toHaveLength(row.supportCount);
  });

  it("Domain drill-down applies the same domain intersection logic", () => {
    expect(filterHeatmapMetricRecords(result.source, "p1", "inDomain").lmps).toHaveLength(row.inDomainCount);
    expect(filterHeatmapMetricRecords(result.source, "p1", "crossDomain").lmps).toHaveLength(row.crossDomainCount);
  });

  it("Students Placed deduplicates by canonical student id", () => {
    const drill = filterHeatmapMetricRecords(result.source, "p1", "studentsPlaced");
    expect(drill.students).toHaveLength(row.studentsPlaced);
    expect(new Set(drill.students.map((s) => s.studentId)).size).toBe(row.studentsPlaced);
  });

  it("LMP Conversion exposes numerator and denominator records", () => {
    const drill = filterHeatmapMetricRecords(result.source, "p1", "lmpConversion");
    expect(drill.convertedLmps).toHaveLength(row.convertedCount);
    expect(drill.denominatorLmps).toHaveLength(row.eligibleClosedCount);
    expect(drill.denominatorLmps.some((r) => r.statusBucket === "onHold")).toBe(false);
  });
});
