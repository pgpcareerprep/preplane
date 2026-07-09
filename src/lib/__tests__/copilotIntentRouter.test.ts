import { describe, expect, it } from "vitest";
import {
  classifyIntent,
  isCaseStudyQuery,
  isCreateLmpQuery,
  isGenuineHelpRequest,
} from "../../../services/orchestrator/copilot/intentRouter";

describe("copilot intent router — case study", () => {
  it("routes case study requests to case_study (not help or create_lmp)", () => {
    const msg =
      "create a case studey for Xoxoday - Product Manager - Fintech / Rewards & Incentives Platform process based on jd";
    expect(classifyIntent(msg)).toBe("case_study");
    expect(isCaseStudyQuery(msg)).toBe(true);
    expect(isGenuineHelpRequest(msg)).toBe(false);
    expect(isCreateLmpQuery(msg)).toBe(false);
  });

  it("does not treat help-me-create as a help fast-path", () => {
    expect(classifyIntent("help me create a case study for Xoxoday")).toBe("case_study");
    expect(classifyIntent("how do I create a case study for Stripe PM")).toBe("case_study");
    expect(classifyIntent("create a case study guide for Xoxoday")).toBe("case_study");
  });

  it("still short-circuits genuine help requests", () => {
    expect(classifyIntent("help")).toBe("help");
    expect(classifyIntent("what can you do?")).toBe("help");
    expect(classifyIntent("show me how to use the copilot")).toBe("help");
    expect(isGenuineHelpRequest("what can you do?")).toBe(true);
  });

  it("still routes create LMP without case study wording", () => {
    expect(classifyIntent("create a new LMP for Google PM")).toBe("create_lmp");
    expect(classifyIntent("start a new process for Stripe")).toBe("create_lmp");
    expect(isCreateLmpQuery("open a new record for Acme")).toBe(true);
  });
});
