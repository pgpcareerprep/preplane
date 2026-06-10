/**
 * Tests for sheet ↔ DB field mapping logic.
 * Verifies that DB_TO_SHEET and sheetPatchToDbPatch work correctly.
 */
import { describe, it, expect } from "vitest";
import { appPatchToDbPatch, DB_TO_SHEET, DB_STATUS_TO_SHEET, sheetPatchToDbPatch } from "@/lib/sheets/fieldMap";

describe("DB_TO_SHEET field map", () => {
  it("is a non-empty object", () => {
    expect(typeof DB_TO_SHEET).toBe("object");
    expect(Object.keys(DB_TO_SHEET).length).toBeGreaterThan(0);
  });

  it("maps status DB column to sheet header", () => {
    expect(DB_TO_SHEET["status"]).toBeDefined();
    expect(typeof DB_TO_SHEET["status"]).toBe("string");
  });

  it("maps core LMP fields", () => {
    expect(DB_TO_SHEET["company"]).toBeDefined();
    expect(DB_TO_SHEET["role"]).toBeDefined();
    expect(DB_TO_SHEET["domain_raw"]).toBeDefined();
    expect(DB_TO_SHEET["comments"]).toBeDefined();
  });

  it("all sheet header values are non-empty strings", () => {
    for (const [dbCol, sheetHeader] of Object.entries(DB_TO_SHEET)) {
      expect(typeof sheetHeader).toBe("string");
      expect(sheetHeader.trim().length).toBeGreaterThan(0);
      expect(dbCol.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate sheet header values (each DB col maps to a unique header)", () => {
    const headers = Object.values(DB_TO_SHEET);
    const unique = new Set(headers);
    expect(unique.size).toBe(headers.length);
  });
});

describe("DB_STATUS_TO_SHEET", () => {
  it("maps canonical DB statuses to sheet display values", () => {
    expect(DB_STATUS_TO_SHEET["prep-ongoing"]).toBeDefined();
    expect(DB_STATUS_TO_SHEET["converted"]).toBeDefined();
    expect(DB_STATUS_TO_SHEET["not-converted"]).toBeDefined();
  });

  it("all values are non-empty strings", () => {
    for (const [k, v] of Object.entries(DB_STATUS_TO_SHEET)) {
      expect(typeof v).toBe("string");
      expect(v.trim().length).toBeGreaterThan(0);
      expect(k.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("sheetPatchToDbPatch (sheet header → DB column translation)", () => {
  it("translates Comment sheet header to comments DB column", () => {
    const result = sheetPatchToDbPatch({ Comment: "My note" });
    expect(result["comments"]).toBe("My note");
  });

  it("rejects non-whitelisted Sheet fields", () => {
    expect(sheetPatchToDbPatch({ Status: "Prep Ongoing" })).toEqual({});
  });

  it("drops unknown sheet headers", () => {
    const result = sheetPatchToDbPatch({ "Unknown Column XYZ": "value" });
    expect(result["Unknown Column XYZ"]).toBeUndefined();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("handles empty patch", () => {
    const result = sheetPatchToDbPatch({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("keeps only whitelisted fields in mixed Sheet patches", () => {
    const result = sheetPatchToDbPatch({
      Comment: "Note",
      "Prep Doc": "https://docs.example.com",
    });
    expect(result["comments"]).toBe("Note");
    expect(result["prep_doc"]).toBeUndefined();
  });
});

describe("appPatchToDbPatch", () => {
  it("translates trusted app patches and normalizes status", () => {
    expect(appPatchToDbPatch({
      Status: "Prep Ongoing",
      "Prep Doc": "https://docs.example.com",
    })).toEqual({
      status: "prep-ongoing",
      prep_doc: "https://docs.example.com",
    });
  });
});
