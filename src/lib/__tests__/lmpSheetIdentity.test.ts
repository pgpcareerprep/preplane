import { describe, expect, it } from "vitest";
import {
  buildLmpSheetIntegrityReport,
  CANONICAL_LMP_TRACKER_HEADERS,
  findLmpSheetRow,
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

  it("blocks drift anywhere in the canonical A:AA header map", () => {
    const drifted = [...headers];
    drifted[25] = "Comment";
    expect(validateLmpTrackerHeaders(drifted).error).toBe("MISALIGNED_LMP_TRACKER_HEADERS");
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

  it("reports duplicate and missing LMP IDs without deleting data", () => {
    const report = buildLmpSheetIntegrityReport(headers, [
      headers,
      row("Microsoft", "Growth Manager", "LMP-1"),
      row("Microsoft", "Growth Manager", "LMP-1"),
      row("Google", "Product Manager", ""),
    ]);
    expect(report.safeToWrite).toBe(true);
    expect(report.duplicateLmpIds).toEqual([{ lmpId: "lmp-1", sheetRows: [15, 16] }]);
    expect(report.missingLmpIdRows).toEqual([17]);
    expect(report.companyRoleWithoutLmpId).toEqual([
      { row: 17, company: "Google", role: "Product Manager" },
    ]);
  });
});
