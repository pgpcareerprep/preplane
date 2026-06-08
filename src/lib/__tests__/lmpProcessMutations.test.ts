/**
 * Tests for LMP process types, STATUS_OPTIONS, and STATUS_OPTIONS coverage.
 * makeLmpProcess requires a fully-seeded Seed object including domainPrepPoc,
 * so we test the simpler exported constants and types here.
 */
import { describe, it, expect } from "vitest";
import { STATUS_OPTIONS } from "@/lib/lmpProcessMutations";
import type { LmpProcessStatus } from "@/lib/lmpProcessMutations";

const ALL_STATUSES: LmpProcessStatus[] = [
  "not-started",
  "ongoing",
  "dormant",
  "hold",
  "closed",
  "converted",
  "not-converted",
  "converted-na",
];

describe("STATUS_OPTIONS", () => {
  it("has an option for every canonical status", () => {
    const optionValues = STATUS_OPTIONS.map((o) => o.value);
    for (const s of ALL_STATUSES) {
      expect(optionValues).toContain(s);
    }
  });

  it("each option has a non-empty label", () => {
    for (const opt of STATUS_OPTIONS) {
      expect(opt.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate values", () => {
    const values = STATUS_OPTIONS.map((o) => o.value);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("has no duplicate labels", () => {
    const labels = STATUS_OPTIONS.map((o) => o.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it("includes user-facing display statuses", () => {
    const labels = STATUS_OPTIONS.map((o) => o.label);
    expect(labels).toContain("Converted");
    expect(labels).toContain("Not Started");
  });
});

describe("Change Status flow — STATUS_OPTIONS lookup", () => {
  it("can find a status option by value for toast messages", () => {
    const target: LmpProcessStatus = "converted";
    const found = STATUS_OPTIONS.find((o) => o.value === target);
    expect(found).toBeDefined();
    expect(found!.label).toBe("Converted");
  });

  it("returns undefined for unknown status value (won't crash toast)", () => {
    const found = STATUS_OPTIONS.find((o) => o.value === ("unknown-xyz" as LmpProcessStatus));
    expect(found).toBeUndefined();
  });

  it("all status values are valid LmpProcessStatus members", () => {
    const validSet = new Set<string>(ALL_STATUSES);
    for (const opt of STATUS_OPTIONS) {
      expect(validSet.has(opt.value)).toBe(true);
    }
  });
});
