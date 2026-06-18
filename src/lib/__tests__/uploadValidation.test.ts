/**
 * Tests for upload validation utilities — email, phone, URL, row validators.
 */
import { describe, it, expect } from "vitest";
import {
  validateEmail,
  validatePhone,
  validateUrl,
  validateMentorRow,
  validateStudentRow,
  validateStudentCsvDuplicates,
} from "@/lib/uploadValidation";

describe("validateEmail", () => {
  it("accepts valid emails", () => {
    expect(validateEmail("mentor@example.com").valid).toBe(true);
    expect(validateEmail("a+b@domain.co.uk").valid).toBe(true);
  });

  it("rejects malformed emails", () => {
    expect(validateEmail("notanemail").valid).toBe(false);
    expect(validateEmail("@domain.com").valid).toBe(false);
    expect(validateEmail("").valid).toBe(false);
  });
});

describe("validatePhone", () => {
  it("accepts 10-digit phone numbers (digits only after stripping spaces/hyphens)", () => {
    // PHONE_RE = /^\d{7,15}$/ applied after stripping whitespace and hyphens
    expect(validatePhone("9876543210").valid).toBe(true);
    expect(validatePhone("987 654 3210").valid).toBe(true);
    expect(validatePhone("987-654-3210").valid).toBe(true);
  });

  it("accepts empty phone (optional field)", () => {
    expect(validatePhone("").valid).toBe(true);
  });

  it("rejects obviously invalid inputs", () => {
    // After stripping spaces/hyphens, "abc" becomes "abc" which fails digit check
    expect(validatePhone("abcdefg").valid).toBe(false);
    // Too short (< 7 digits)
    expect(validatePhone("123").valid).toBe(false);
  });

  it("rejects international prefix (+91) since + is stripped as non-digit", () => {
    // "+91 9876543210" → stripped to "919876543210" (12 digits) → valid
    // but "+" is not in [\s-] so "+91" → stripped remains "+91..." which fails PHONE_RE
    // Actual: "+" is NOT stripped, so "+91 9876543210" → "+919876543210" → fails /^\d{7,15}$/
    expect(validatePhone("+91 9876543210").valid).toBe(false);
  });
});

describe("validateUrl", () => {
  it("accepts https URLs", () => {
    expect(validateUrl("https://example.com").valid).toBe(true);
    expect(validateUrl("https://linkedin.com/in/user").valid).toBe(true);
  });

  it("accepts http URLs", () => {
    expect(validateUrl("http://example.com").valid).toBe(true);
  });

  it("accepts empty URL (optional field)", () => {
    expect(validateUrl("").valid).toBe(true);
  });

  it("rejects bare domain without protocol", () => {
    expect(validateUrl("example.com").valid).toBe(false);
  });
});

describe("validateMentorRow", () => {
  const validRow = {
    name: "Alice Mentor",
    email: "alice@company.com",
    linkedin: "https://linkedin.com/in/alice",
  };

  it("passes a fully-populated valid row", () => {
    const errors = validateMentorRow(validRow, 0);
    expect(errors).toHaveLength(0);
  });

  it("flags missing name", () => {
    const errors = validateMentorRow({ ...validRow, name: "" }, 0);
    expect(errors.some((e) => e.toLowerCase().includes("name"))).toBe(true);
  });

  it("flags invalid email", () => {
    const errors = validateMentorRow({ ...validRow, email: "bad-email" }, 0);
    expect(errors.some((e) => e.toLowerCase().includes("email"))).toBe(true);
  });

  it("does not validate linkedin URL (field not checked by this validator)", () => {
    // validateMentorRow only checks name, email, phone, rate — not linkedin
    const errors = validateMentorRow({ ...validRow, linkedin: "not-a-url" }, 0);
    expect(errors).toHaveLength(0);
  });

  it("includes row index in error messages (rowIdx 5 → 'Row 7')", () => {
    // rowPrefix(rowIdx) returns `Row ${rowIdx + 2}` to match 1-based sheet row with header
    const errors = validateMentorRow({ ...validRow, name: "" }, 5);
    expect(errors.some((e) => e.includes("Row 7"))).toBe(true);
  });
});

describe("validateStudentRow", () => {
  const validStudent = {
    name: "Bob Student",
    email: "bob@university.edu",
    primary_domain: "Product Management", // required field name is primary_domain, not domain
  };

  it("passes a valid student row", () => {
    const errors = validateStudentRow(validStudent, 0);
    expect(errors).toHaveLength(0);
  });

  it("flags missing name", () => {
    const errors = validateStudentRow({ ...validStudent, name: "" }, 0);
    expect(errors.some((e) => e.toLowerCase().includes("name"))).toBe(true);
  });

  it("flags missing primary_domain", () => {
    const errors = validateStudentRow({ ...validStudent, primary_domain: "" }, 0);
    expect(errors.some((e) => e.includes("primary_domain"))).toBe(true);
  });
});

describe("validateStudentCsvDuplicates", () => {
  it("returns no errors for unique emails and student IDs", () => {
    const errors = validateStudentCsvDuplicates([
      { email: "a@example.com", roll_no: "S001" },
      { email: "b@example.com", roll_no: "S002" },
    ]);
    expect(errors).toHaveLength(0);
  });

  it("flags duplicate emails with row numbers", () => {
    const errors = validateStudentCsvDuplicates([
      { email: "dup@example.com", roll_no: "S001" },
      { email: "dup@example.com", roll_no: "S002" },
    ]);
    expect(errors.some((e) => e.includes('Duplicate email "dup@example.com" in rows 2, 3'))).toBe(true);
  });

  it("flags duplicate student IDs with row numbers", () => {
    const errors = validateStudentCsvDuplicates([
      { email: "a@example.com", roll_no: "S001" },
      { email: "b@example.com", roll_no: "S001" },
    ]);
    expect(errors.some((e) => e.includes('Duplicate Student ID "S001" in rows 2, 3'))).toBe(true);
  });
});
