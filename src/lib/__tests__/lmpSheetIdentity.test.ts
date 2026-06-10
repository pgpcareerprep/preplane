import { describe, expect, it } from "vitest";
import { findLmpSheetRow } from "../../../supabase/functions/_shared/lmpSheetIdentity";

const headers = ["Date", "Company", "Role", "LMP ID"];

describe("findLmpSheetRow", () => {
  it("does not reuse a company/role row when a different LMP ID is supplied", () => {
    const rows = [
      headers,
      ["", "Microsoft", "Growth Manager", "LMP-1"],
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
      ["", "Microsoft", "Growth Manager", "LMP-1"],
      ["", "Microsoft", "Product Manager", "LMP-2"],
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
      ["", "Microsoft", "Growth Manager", ""],
    ];

    expect(findLmpSheetRow(headers, rows, {
      company: " microsoft ",
      role: "growth manager",
    }).rowIndex).toBe(-1);
  });
});
