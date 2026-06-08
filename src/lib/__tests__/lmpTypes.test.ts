/**
 * Tests for lmpTypes utilities: ageDays, ageLabel, slaChip, STATUSES.
 */
import { describe, it, expect } from "vitest";
import { ageDays, ageLabel, slaChip, STATUS_META, HEALTH_META } from "@/lib/lmpTypes";
import { STATUSES } from "@/types/lmp";
import type { LmpStatus } from "@/types/lmp";

describe("ageDays", () => {
  it("returns 0 when createdAt matches today", () => {
    const today = new Date("2024-03-15");
    expect(ageDays("2024-03-15", today)).toBe(0);
  });

  it("returns correct number of days for past dates", () => {
    const today = new Date("2024-03-15");
    expect(ageDays("2024-03-05", today)).toBe(10);
    expect(ageDays("2024-02-15", today)).toBe(29);
  });

  it("returns 0 for empty string", () => {
    expect(ageDays("")).toBe(0);
  });
});

describe("ageLabel", () => {
  it("returns a non-empty string for a past date", () => {
    const label = ageLabel("2024-01-01");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });

  it("returns '0d' for empty input (ageDays returns 0)", () => {
    // ageLabel always returns `${ageDays(input)}d` — returns "0d" for empty string
    expect(ageLabel("")).toBe("0d");
  });
});

describe("slaChip", () => {
  it("returns green-style chip for short SLA", () => {
    const chip = slaChip(5);
    expect(chip.label).toContain("5");
  });

  it("returns different styling for 30+ days (overdue)", () => {
    const shortChip = slaChip(5);
    const longChip = slaChip(45);
    // The cls strings should differ (different color tokens)
    expect(shortChip.cls).not.toBe(longChip.cls);
  });
});

describe("STATUS_META", () => {
  it("has an entry for every canonical LMP status", () => {
    for (const status of STATUSES) {
      expect(STATUS_META[status as LmpStatus]).toBeDefined();
      expect(STATUS_META[status as LmpStatus].label.length).toBeGreaterThan(0);
    }
  });

  it("each entry has pill and dot class strings", () => {
    for (const meta of Object.values(STATUS_META)) {
      expect(typeof meta.pill).toBe("string");
      expect(typeof meta.dot).toBe("string");
    }
  });
});

describe("HEALTH_META", () => {
  const healthKeys = ["Healthy", "Slow", "Stuck"] as const;

  it("has entries for all three health states", () => {
    for (const h of healthKeys) {
      expect(HEALTH_META[h]).toBeDefined();
    }
  });

  it("each entry has dot and text class strings", () => {
    for (const meta of Object.values(HEALTH_META)) {
      expect(typeof meta.dot).toBe("string");
      expect(typeof meta.text).toBe("string");
    }
  });
});
