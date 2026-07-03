import { describe, expect, it } from "vitest";
import {
  sanitizeConfirmationCardBlock,
  sanitizePendingActionSummary,
  scrubLabelText,
} from "@/lib/copilot/confirmationLabels";

describe("confirmationLabels", () => {
  it("scrubs undefined segments from labels", () => {
    expect(scrubLabelText("test – undefined")).toBe("test");
    expect(scrubLabelText("undefined · PM")).toBe("PM");
  });

  it("scrubs invalid change values but keeps valid description", () => {
    const r = sanitizeConfirmationCardBlock({
      type: "confirmation-card",
      title: "Update",
      description: "Set daily_progress on test – undefined",
      confirm_action: "confirm",
      changes: [{ field: "Daily Progress", to: "undefined" }],
    });
    expect(r?.description).toBe("Set daily_progress on test");
    expect(r?.changes).toBeUndefined();
  });

  it("keeps valid confirmation cards", () => {
    const r = sanitizeConfirmationCardBlock({
      type: "confirmation-card",
      title: "Update daily progress",
      description: "Set Daily Progress on Acme – Product Manager",
      confirm_action: "confirm",
      changes: [{ field: "Daily Progress", to: "in progress" }],
    });
    expect(r?.description).toContain("Acme");
    expect(r?.changes?.[0]?.to).toBe("in progress");
  });

  it("sanitizes pending action summaries", () => {
    expect(sanitizePendingActionSummary("Set X on test – undefined")).toBe("Set X on test");
  });
});
