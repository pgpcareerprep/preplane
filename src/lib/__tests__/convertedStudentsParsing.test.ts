/**
 * Regression tests for the Total Students Converted KPI.
 *
 * Covers:
 *  - parseConvertedNames: splitting, filtering, normalization
 *  - normalizeConvertedName: whitespace collapse + lowercase
 *  - KPI counting logic (unique-name dedup)
 *  - Modal row logic (unique name+LMP dedup, within-LMP dedup)
 *  - Edge cases: null, blank, "-", "NA", "N/A"
 */
import { describe, it, expect, vi } from "vitest";

// parseConvertedNames and normalizeConvertedName are pure functions that don't
// touch Supabase, but AdminLmpDashboard transitively imports the client.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn() }) }),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
  },
}));

import {
  parseConvertedNames,
  normalizeConvertedName,
} from "@/components/dashboards/AdminLmpDashboard";

// ─── parseConvertedNames ────────────────────────────────────────────────────

describe("parseConvertedNames", () => {
  it("returns [] for null", () => {
    expect(parseConvertedNames(null)).toEqual([]);
  });

  it("returns [] for undefined", () => {
    expect(parseConvertedNames(undefined)).toEqual([]);
  });

  it("returns [] for empty string", () => {
    expect(parseConvertedNames("")).toEqual([]);
  });

  it("returns [] for '-'", () => {
    expect(parseConvertedNames("-")).toEqual([]);
  });

  it("returns [] for 'NA'", () => {
    expect(parseConvertedNames("NA")).toEqual([]);
  });

  it("returns [] for 'N/A'", () => {
    expect(parseConvertedNames("N/A")).toEqual([]);
  });

  it("splits on comma", () => {
    expect(parseConvertedNames("Aarushi, Aayush")).toEqual(["Aarushi", "Aayush"]);
  });

  it("splits on newline", () => {
    expect(parseConvertedNames("Aarushi\nAayush")).toEqual(["Aarushi", "Aayush"]);
  });

  it("splits on semicolon", () => {
    expect(parseConvertedNames("Aarushi;Aayush")).toEqual(["Aarushi", "Aayush"]);
  });

  it("trims leading and trailing spaces", () => {
    const parsed = parseConvertedNames("  Aarushi  ,  Aayush  ");
    expect(parsed).toEqual(["Aarushi", "Aayush"]);
  });

  it("collapses repeated internal spaces", () => {
    const parsed = parseConvertedNames("Aarushi  Sharma");
    expect(parsed).toEqual(["Aarushi Sharma"]);
  });

  it("preserves original casing", () => {
    const parsed = parseConvertedNames("Aarushi");
    expect(parsed[0]).toBe("Aarushi");
  });

  it("filters blank entries that appear after splitting", () => {
    // double comma produces empty segment
    const parsed = parseConvertedNames("Aarushi,,Aayush");
    expect(parsed).toEqual(["Aarushi", "Aayush"]);
  });

  it("single name returned as single-element array", () => {
    expect(parseConvertedNames("Aarushi")).toEqual(["Aarushi"]);
  });

  it("handles mixed separators", () => {
    const parsed = parseConvertedNames("Aarushi,Aayush\nAnkita;Arjun");
    expect(parsed).toHaveLength(4);
    expect(parsed).toContain("Aarushi");
    expect(parsed).toContain("Aayush");
    expect(parsed).toContain("Ankita");
    expect(parsed).toContain("Arjun");
  });
});

// ─── normalizeConvertedName ──────────────────────────────────────────────────

describe("normalizeConvertedName", () => {
  it("lowercases", () => {
    expect(normalizeConvertedName("AARUSHI")).toBe("aarushi");
  });

  it("trims edges", () => {
    expect(normalizeConvertedName("  aarushi  ")).toBe("aarushi");
  });

  it("collapses internal spaces", () => {
    expect(normalizeConvertedName("Aarushi  Sharma")).toBe("aarushi sharma");
  });

  it("case-insensitive dedup: 'aarushi' and ' Aarushi ' normalize identically", () => {
    expect(normalizeConvertedName("aarushi")).toBe(normalizeConvertedName(" Aarushi "));
  });
});

// ─── KPI counting logic ──────────────────────────────────────────────────────

describe("KPI unique count logic", () => {
  function countUnique(lmpFinalNames: (string | null | undefined)[]): number {
    const uniqueKeys = new Set<string>();
    for (const raw of lmpFinalNames) {
      for (const name of parseConvertedNames(raw)) {
        uniqueKeys.add(normalizeConvertedName(name));
      }
    }
    return uniqueKeys.size;
  }

  it("acceptance test 1: empty string → KPI = 0", () => {
    expect(countUnique([""])).toBe(0);
  });

  it("acceptance test 2: 'Aarushi' in one LMP → KPI = 1", () => {
    expect(countUnique(["Aarushi"])).toBe(1);
  });

  it("acceptance test 3: 'Aarushi, Aayush' in one LMP → KPI = 2", () => {
    expect(countUnique(["Aarushi, Aayush"])).toBe(2);
  });

  it("acceptance test 4: Aarushi in two different LMPs → KPI = 1", () => {
    expect(countUnique(["Aarushi", "Aarushi"])).toBe(1);
  });

  it("acceptance test 5: 'aarushi' and ' Aarushi ' → KPI = 1", () => {
    expect(countUnique(["aarushi", " Aarushi "])).toBe(1);
  });

  it("multiple distinct students across LMPs", () => {
    expect(countUnique(["Aarushi, Aayush", "Ankita", "Aarushi"])).toBe(3);
  });
});

// ─── Modal dedup logic ───────────────────────────────────────────────────────

describe("Modal row deduplication", () => {
  function buildModalRows(lmps: { id: string; finalConvertedNames: string | null | undefined }[]) {
    const seenNameLmp = new Set<string>();
    const rows: { studentName: string; lmpId: string }[] = [];

    for (const lmp of lmps) {
      for (const name of parseConvertedNames(lmp.finalConvertedNames)) {
        const key = normalizeConvertedName(name);
        const dedupKey = `${key}::${lmp.id}`;
        if (!seenNameLmp.has(dedupKey)) {
          seenNameLmp.add(dedupKey);
          rows.push({ studentName: name, lmpId: lmp.id });
        }
      }
    }
    return rows;
  }

  it("Aarushi in LMP-A and LMP-B → 2 modal records", () => {
    const rows = buildModalRows([
      { id: "lmp-a", finalConvertedNames: "Aarushi" },
      { id: "lmp-b", finalConvertedNames: "Aarushi" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.studentName === "Aarushi")).toBe(true);
  });

  it("Aarushi repeated twice in same LMP → 1 modal record", () => {
    const rows = buildModalRows([
      { id: "lmp-a", finalConvertedNames: "Aarushi, Aarushi" },
    ]);
    expect(rows).toHaveLength(1);
  });

  it("case variants of same name in same LMP → 1 modal record", () => {
    const rows = buildModalRows([
      { id: "lmp-a", finalConvertedNames: "Aarushi, aarushi" },
    ]);
    expect(rows).toHaveLength(1);
  });

  it("null LMP → 0 modal records", () => {
    const rows = buildModalRows([{ id: "lmp-a", finalConvertedNames: null }]);
    expect(rows).toHaveLength(0);
  });

  it("preserves original casing in studentName field", () => {
    const rows = buildModalRows([{ id: "lmp-a", finalConvertedNames: "Aarushi Sharma" }]);
    expect(rows[0].studentName).toBe("Aarushi Sharma");
  });
});
