import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeWebRelevance,
  passesMentorEligibility,
  roleDomainMatches,
  verifyRegionFromEvidence,
} from "@/lib/externalMentorFilters";
import { enabledExternalPlatforms } from "@/lib/externalMentors";

const root = resolve(import.meta.dirname, "../../..");

function baseMentor(overrides: Record<string, unknown> = {}) {
  return {
    name: "Alex Kumar",
    current_role: "Data Scientist",
    company: "Acme Analytics",
    industry: "Technology",
    skills: ["Python", "SQL", "Machine Learning"],
    platform: "Topmate",
    source_url: "https://topmate.io/alex",
    evidence: "Data scientist based in Bengaluru, India — mentors on data analytics and ML.",
    confidence: 72,
    matched_fields: ["role", "skills"],
    ...overrides,
  };
}

describe("verifyRegionFromEvidence", () => {
  it("rejects Africa/US/UK profiles when region is India", () => {
    expect(verifyRegionFromEvidence("in", "mentor based in Lagos, Nigeria").region_verified).toBe(false);
    expect(verifyRegionFromEvidence("in", "San Francisco, California mentor").region_verified).toBe(false);
    expect(verifyRegionFromEvidence("in", "London, United Kingdom").region_verified).toBe(false);
  });

  it("accepts India evidence when region is India", () => {
    const v = verifyRegionFromEvidence("in", "Data mentor in Bengaluru, India");
    expect(v.region_verified).toBe(true);
    expect(v.country).toBe("IN");
  });

  it("allows global profiles when region is global", () => {
    expect(verifyRegionFromEvidence("global", "mentor in Nairobi, Kenya").region_verified).toBe(true);
    expect(verifyRegionFromEvidence("global", "no location mentioned").region_verified).toBe(true);
  });
});

describe("passesMentorEligibility", () => {
  it("rejects mentors without source_url", () => {
    expect(passesMentorEligibility(baseMentor({ source_url: "" }), { region: "global", role: "Data Scientist" })).toBe(false);
    expect(passesMentorEligibility(baseMentor({ source_url: null }), { region: "in", role: "Data Scientist" })).toBe(false);
  });

  it("rejects mentors without region evidence when region is not global", () => {
    const m = baseMentor({ evidence: "Generic mentor profile with no geography" });
    expect(passesMentorEligibility(m, { region: "in", role: "Data Scientist" })).toBe(false);
  });

  it("accepts India mentors with region evidence", () => {
    expect(passesMentorEligibility(baseMentor(), { region: "in", role: "Data Scientist" })).toBe(true);
  });
});

describe("roleDomainMatches", () => {
  it("rejects unrelated mentors for Data role", () => {
    const m = baseMentor({
      current_role: "Career Coach",
      company: "Growth Partners",
      industry: "Coaching",
      skills: ["mentoring", "communication"],
      evidence: "Professional mentor helping job seekers",
    });
    expect(roleDomainMatches("Data Scientist", m)).toBe(false);
  });

  it("accepts data-aligned mentors for Data role", () => {
    expect(roleDomainMatches("Data Scientist", baseMentor())).toBe(true);
    expect(roleDomainMatches("Data Engineer", baseMentor({ current_role: "ML Engineer" }))).toBe(true);
  });
});

describe("computeWebRelevance", () => {
  it("requires region, role, domain, and confidence for external relevance", () => {
    const m = baseMentor({ confidence: 30, matched_fields: [] });
    expect(computeWebRelevance(m, { region: "in", role: "Data Scientist" })).toBe(false);

    const good = baseMentor();
    expect(computeWebRelevance(good, { region: "in", role: "Data Scientist" })).toBe(true);
  });
});

describe("enabledExternalPlatforms", () => {
  it("does not include disabled LinkedIn or Superpeer", () => {
    const platforms = enabledExternalPlatforms({
      topmate: true,
      adplist: true,
      linkedin: false,
      superpeer: false,
    });
    expect(platforms).toEqual(["Topmate", "ADPList"]);
    expect(platforms).not.toContain("LinkedIn");
    expect(platforms).not.toContain("Superpeer");
  });

  it("returns only Topmate when that is the sole enabled platform", () => {
    expect(
      enabledExternalPlatforms({ topmate: true, adplist: false, linkedin: false, superpeer: false }),
    ).toEqual(["Topmate"]);
  });
});

describe("contact sanitization (edge provider)", () => {
  const sanitizeSrc = readFileSync(
    resolve(root, "supabase/functions/_shared/providers/mentorSanitize.ts"),
    "utf8",
  );

  it("only keeps email when present in source text", () => {
    expect(sanitizeSrc).toContain("sanitizeEmail");
    expect(sanitizeSrc).toContain('hay.toLowerCase().includes(s.toLowerCase())');
  });

  it("only keeps phone when present in source text", () => {
    expect(sanitizeSrc).toContain("sanitizePhone");
    expect(sanitizeSrc).toContain("lowHay.includes(s.toLowerCase())");
  });
});
