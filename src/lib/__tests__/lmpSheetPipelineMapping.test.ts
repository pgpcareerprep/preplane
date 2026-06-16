import { describe, expect, it } from "vitest";
import {
  buildLmpPipelineSheetPatch,
  LMP_PIPELINE_SHEET_HEADERS,
  normalizePipelineSheetValue,
} from "../../../supabase/functions/_shared/lmpSheetPipeline";
import { CANONICAL_LMP_TRACKER_HEADERS } from "../../../supabase/functions/_shared/lmpSheetIdentity";
import { resolveStageToRoundId } from "@/lib/pipelineStage";

describe("LMP pipeline Google Sheet mapping", () => {
  it("maps pipeline values to N/O, P/Q, R/S, T/U, V/W", () => {
    expect(CANONICAL_LMP_TRACKER_HEADERS[13]).toBe("Shortlisted (Pool) - Number");
    expect(CANONICAL_LMP_TRACKER_HEADERS[14]).toBe("Shortlisted (Pool) - Name(s)");
    expect(CANONICAL_LMP_TRACKER_HEADERS[15]).toBe("R1 - Numbers");
    expect(CANONICAL_LMP_TRACKER_HEADERS[16]).toBe("R1 - Names");
    expect(CANONICAL_LMP_TRACKER_HEADERS[17]).toBe("R2 - Numbers");
    expect(CANONICAL_LMP_TRACKER_HEADERS[18]).toBe("R2 - Names");
    expect(CANONICAL_LMP_TRACKER_HEADERS[19]).toBe("R3 - Numbers");
    expect(CANONICAL_LMP_TRACKER_HEADERS[20]).toBe("R3 - Names");
    expect(CANONICAL_LMP_TRACKER_HEADERS[21]).toBe("Final Converted Numbers");
    expect(CANONICAL_LMP_TRACKER_HEADERS[22]).toBe("Converted Names");
    expect(LMP_PIPELINE_SHEET_HEADERS).toEqual(CANONICAL_LMP_TRACKER_HEADERS.slice(13, 23));
  });

  it("builds the LMP-2026-0089 regression patch from fresh lmp_full_view values", () => {
    const patch = buildLmpPipelineSheetPatch({
      pool_count: 7,
      pool_names: "Aagrah Nigam, Aarushi, Candidate 3, Candidate 4, Candidate 5, Candidate 6, Candidate 7",
      r1_count: 1,
      r1_names: "Ayush",
      r2_count: 0,
      r2_names: null,
      r3_count: 0,
      r3_names: null,
      converted_count: 0,
      converted_names: null,
      offer_count: 0,
    });

    expect(patch).toMatchObject({
      "Shortlisted (Pool) - Number": 7,
      "Shortlisted (Pool) - Name(s)": "Aagrah Nigam, Aarushi, Candidate 3, Candidate 4, Candidate 5, Candidate 6, Candidate 7",
      "R1 - Numbers": 1,
      "R1 - Names": "Ayush",
      "R2 - Numbers": 0,
      "R2 - Names": "",
      "R3 - Numbers": 0,
      "R3 - Names": "",
      "Final Converted Numbers": 0,
      "Converted Names": "",
    });
  });

  it("keeps shortlisted in the Pool stage everywhere", () => {
    expect(resolveStageToRoundId("shortlisted")).toBe("pool");
    expect(resolveStageToRoundId("shortlisted_pool")).toBe("pool");
    expect(resolveStageToRoundId("shortlisted-pool")).toBe("pool");
    expect(resolveStageToRoundId("r1_shortlisted")).toBe("r1");
  });

  it("normalizes sheet values for read-after-write verification", () => {
    expect(normalizePipelineSheetValue("1.0")).toBe("1");
    expect(normalizePipelineSheetValue("  Ayush\nSingh ")).toBe("Ayush Singh");
    expect(normalizePipelineSheetValue(null)).toBe("");
  });
});
