import { describe, expect, it } from "vitest";
import {
  buildLmpSheetIntegrityReport,
  CANONICAL_LMP_TRACKER_HEADERS,
  findLmpSheetRow,
  findCompactableLmpBlankRows,
  findLmpSheetRowIndexes,
  getLmpTrackerHeaderDrift,
  validateLmpTrackerHeaders,
} from "../../../supabase/functions/_shared/lmpSheetIdentity";

const headers = [...CANONICAL_LMP_TRACKER_HEADERS];
const row = (company: string, role: string, lmpId: string) => {
  const values = Array(headers.length).fill("");
  values[1] = company;
  values[2] = role;
  values[26] = lmpId;
  return values;
};

describe("findLmpSheetRow", () => {
  it("does not reuse a company/role row when a different LMP ID is supplied", () => {
    const rows = [
      headers,
      row("Microsoft", "Growth Manager", "LMP-1"),
    ];

    expect(findLmpSheetRow(headers, rows, {
      company: "Microsoft",
      role: "Growth Manager",
      lmpCode: "LMP-2",
    }).rowIndex).toBe(-1);
  });

  it("finds the exact LMP ID regardless of company or role changes", () => {
    const rows = [
      headers,
      row("Microsoft", "Growth Manager", "LMP-1"),
      row("Microsoft", "Product Manager", "LMP-2"),
    ];

    expect(findLmpSheetRow(headers, rows, {
      company: "Microsoft renamed",
      role: "Product renamed",
      lmpCode: "lmp-2",
    }).rowIndex).toBe(2);
  });

  it("never uses Company+Role matching when the immutable LMP ID is missing", () => {
    const rows = [
      headers,
      row("Microsoft", "Growth Manager", ""),
    ];

    expect(findLmpSheetRow(headers, rows, {
      company: " microsoft ",
      role: "growth manager",
    }).rowIndex).toBe(-1);
  });

  it("blocks a duplicated LMP ID header instead of appending", () => {
    const ambiguous = [...headers, "LMP ID"];
    expect(validateLmpTrackerHeaders(ambiguous).error).toBe("DUPLICATE_LMP_ID_HEADERS");
    expect(findLmpSheetRow(ambiguous, [ambiguous], {
      company: "Microsoft",
      role: "Growth Manager",
      lmpCode: "LMP-1",
    }).error).toBe("DUPLICATE_LMP_ID_HEADERS");
  });

  it("blocks a misplaced LMP ID header instead of appending", () => {
    const misplaced = [...headers];
    misplaced[26] = "JD";
    misplaced[27] = "LMP ID";
    expect(validateLmpTrackerHeaders(misplaced).error).toBe("MISALIGNED_LMP_ID_HEADER");
  });

  it("reports harmless display-label drift without blocking ID-based writes", () => {
    const drifted = [...headers];
    drifted[13] = "R1\nShortlisted";
    drifted[18] = "Prep Doc Link";
    drifted[25] = "Comment";
    expect(validateLmpTrackerHeaders(drifted).error).toBeUndefined();
    expect(getLmpTrackerHeaderDrift(drifted)).toEqual([
      { column: 14, expected: "R1 Shortlisted", actual: "R1\nShortlisted" },
      { column: 26, expected: "Comments", actual: "Comment" },
    ]);
  });

  it("blocks duplicate rows with the same LMP ID from update or delete", () => {
    const rows = [
      headers,
      row("Microsoft", "Growth Manager", "LMP-1"),
      row("Microsoft", "Growth Manager", "LMP-1"),
    ];
    expect(findLmpSheetRow(headers, rows, {
      company: "Microsoft",
      role: "Growth Manager",
      lmpCode: "LMP-1",
    }).error).toBe("DUPLICATE_LMP_ID_ROWS");
  });

  it("returns every exact LMP ID row for an explicit delete", () => {
    const rows = [
      headers,
      row("Microsoft", "Growth Manager", "LMP-1"),
      row("Microsoft", "Growth Manager", "LMP-1"),
      row("Google", "Product Manager", "LMP-2"),
    ];
    expect(findLmpSheetRowIndexes(headers, rows, "lmp-1")).toEqual([1, 2]);
  });

  it("finds only blank template gaps before the final meaningful row", () => {
    const blank = Array(headers.length).fill("");
    blank[7] = false;
    blank[8] = false;
    const meaningfulWithoutId = [...blank];
    meaningfulWithoutId[1] = "Historical company";
    expect(findCompactableLmpBlankRows(headers, [
      headers,
      blank,
      row("Microsoft", "Growth Manager", "LMP-1"),
      blank,
      meaningfulWithoutId,
      blank,
    ])).toEqual([15, 17]);
  });

  it("reports duplicate and missing LMP IDs without deleting data", () => {
    const blankTemplate = Array(headers.length).fill("");
    blankTemplate[7] = false;
    const report = buildLmpSheetIntegrityReport(headers, [
      headers,
      row("Microsoft", "Growth Manager", "LMP-1"),
      row("Microsoft", "Growth Manager", "LMP-1"),
      row("Google", "Product Manager", ""),
      blankTemplate,
    ]);
    expect(report.safeToWrite).toBe(true);
    expect(report.duplicateLmpIds).toEqual([{ lmpId: "lmp-1", sheetRows: [15, 16] }]);
    expect(report.missingLmpIdRows).toEqual([17]);
    expect(report.companyRoleWithoutLmpId).toEqual([
      { row: 17, company: "Google", role: "Product Manager" },
    ]);
  });
});
