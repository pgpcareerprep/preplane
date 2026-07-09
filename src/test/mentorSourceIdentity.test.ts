import { describe, expect, it } from "vitest";
import {
  buildMentorIdentitySourceIndex,
  normalizeMentorEmail,
  resolveMentorSources,
} from "@/lib/mentorSourceIdentity";

describe("buildMentorIdentitySourceIndex", () => {
  it("merges MU and ALU when mentor rows share the same normalized name", () => {
    const index = buildMentorIdentitySourceIndex([
      { id: "mu-1", name: "Samarth Pundir", source: "MU" },
      { id: "alu-1", name: "Samarth Pundir", source: "ALU", sync_source: "alumni_mirror" },
    ]);

    expect(index.byId.get("mu-1")).toEqual(["MU", "ALU"]);
    expect(index.byName.get("samarth pundir")).toEqual(["MU", "ALU"]);
  });

  it("adds ALU when alumni email matches a MU mentor row", () => {
    const index = buildMentorIdentitySourceIndex(
      [{ id: "mu-1", name: "Apoorve Jhanwar", email: "apoorve@example.com", source: "MU" }],
      [{ student_name: "Apoorve J.", mu_email_id: "apoorve@example.com" }],
    );

    expect(resolveMentorSources(index, { id: "mu-1", name: "Apoorve Jhanwar", source: "MU" }))
      .toEqual(["MU", "ALU"]);
  });

  it("keeps single-source mentors unchanged", () => {
    const index = buildMentorIdentitySourceIndex([
      { id: "mu-2", name: "Ruchi Tandon", source: "MU" },
    ]);

    expect(index.byId.get("mu-2")).toEqual(["MU"]);
  });
});

describe("normalizeMentorEmail", () => {
  it("lowercases and trims emails", () => {
    expect(normalizeMentorEmail("  Apoorve@Example.COM ")).toBe("apoorve@example.com");
  });
});
