import { describe, it, expect } from "vitest";
import { isNextProgressDatePast, isProgressOverdue } from "@/lib/lmpOverdue";

describe("isNextProgressDatePast", () => {
  const now = new Date("2026-07-24T12:00:00");

  it("returns false for empty / invalid", () => {
    expect(isNextProgressDatePast(null, now)).toBe(false);
    expect(isNextProgressDatePast("", now)).toBe(false);
    expect(isNextProgressDatePast("not-a-date", now)).toBe(false);
  });

  it("returns false when due is today or future", () => {
    expect(isNextProgressDatePast("2026-07-24", now)).toBe(false);
    expect(isNextProgressDatePast("2026-07-25", now)).toBe(false);
  });

  it("returns true when due is before today", () => {
    expect(isNextProgressDatePast("2026-07-20", now)).toBe(true);
  });
});

describe("isProgressOverdue", () => {
  const now = new Date("2026-07-24T12:00:00");

  it("is overdue when next date is past and no later progress update", () => {
    expect(isProgressOverdue("2026-07-20", null, now)).toBe(true);
    expect(isProgressOverdue("2026-07-20", "2026-07-19T10:00:00Z", now)).toBe(true);
  });

  it("is not overdue when progress was updated after the due date", () => {
    expect(isProgressOverdue("2026-07-20", "2026-07-21T08:00:00Z", now)).toBe(false);
    expect(isProgressOverdue("2026-07-20", "2026-07-24T09:00:00Z", now)).toBe(false);
  });

  it("is not overdue when next date is today or future", () => {
    expect(isProgressOverdue("2026-07-24", null, now)).toBe(false);
    expect(isProgressOverdue("2026-07-30", "2026-07-01T00:00:00Z", now)).toBe(false);
  });
});
