import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  historicalLmpImporterUsesDirectSheetWrites,
  planHistoricalLmpBackfill,
} from "@/lib/historicalLmpBackfill";

const csv = (headers: string, row: string) => `${headers}\n${row}\n`;

describe("historical LMP backfill planner", () => {
  it("inserts a row with a blank LMP ID safely", () => {
    const report = planHistoricalLmpBackfill(
      csv("Date,Company,Role,LMP ID", "8 Jun 2026,BharatPe,Sales Excellence,"),
      [],
    );
    expect(report.inserts).toBe(1);
    expect(report.commitRows[0].patch.lmp_code).toBeUndefined();
    expect(report.commitRows[0].patch.date).toBe("2026-06-08");
  });

  it("updates the exact existing LMP ID and fills only blank fields", () => {
    const report = planHistoricalLmpBackfill(
      csv("Date,Company,Role,Daily Progress,LMP ID", "8 Jun 2026,BharatPe,Sales Excellence,New note,LMP-2026-0010"),
      [{ id: "a", lmp_code: "LMP-2026-0010", company: "BharatPe", role: "Sales Excellence", date: "2026-06-08", daily_progress: "" }],
    );
    expect(report.updates).toBe(1);
    expect(report.rows[0].changedFields).toEqual(["daily_progress"]);
  });

  it("marks duplicate company-role-date matches ambiguous", () => {
    const input = csv("Date,Company,Role,LMP ID", "8 Jun 2026,BharatPe,Sales Excellence,");
    const existing = [
      { id: "a", lmp_code: "LMP-1", company: "BharatPe", role: "Sales Excellence", date: "2026-06-08" },
      { id: "b", lmp_code: "LMP-2", company: " bharatpe ", role: "sales excellence", date: "2026-06-08" },
    ];
    expect(planHistoricalLmpBackfill(input, existing).ambiguous).toBe(1);
  });

  it("maps CSV newline headers through the canonical field map", () => {
    const report = planHistoricalLmpBackfill(
      csv('Date,Company,Role,"R1 - Names","Converted Names"', '8 Jun 2026,BharatPe,Sales Excellence,"A, B",Aditi'),
      [],
    );
    expect(report.commitRows[0].patch.r1_names).toBe("A, B");
    expect(report.commitRows[0].patch.final_converted_names).toBe("Aditi");
  });

  it("does not plan blank CSV values over non-empty DB values", () => {
    const report = planHistoricalLmpBackfill(
      csv("Date,Company,Role,Daily Progress", "8 Jun 2026,BharatPe,Sales Excellence,"),
      [{ id: "a", lmp_code: "LMP-1", company: "BharatPe", role: "Sales Excellence", date: "2026-06-08", daily_progress: "Keep me" }],
    );
    expect(report.updates).toBe(0);
    expect(report.rows[0].action).toBe("skip");
  });

  it("does not directly write or insert Google Sheet rows", () => {
    expect(historicalLmpImporterUsesDirectSheetWrites()).toBe(false);
  });

  it("queues Sheet reconcile only after the transactional DB row loop", () => {
    const migration = fs.readFileSync(
      path.resolve("supabase/migrations/20260615150000_historical_lmp_csv_backfill_rpc.sql"),
      "utf8",
    );
    const loopEnd = migration.lastIndexOf("END LOOP;");
    const reconcile = migration.indexOf("PERFORM public.enqueue_lmp_sheet_reconcile();");
    expect(loopEnd).toBeGreaterThan(-1);
    expect(reconcile).toBeGreaterThan(loopEnd);
    expect(migration).not.toMatch(/insertRowAtTop|appendRow|Google Sheets API/i);
  });

  it("plans a 13-row historical batch without losing rows", () => {
    const rows = Array.from({ length: 13 }, (_, index) =>
      `8 Jun 2026,Company ${index + 1},Role ${index + 1},`
    ).join("\n");
    const report = planHistoricalLmpBackfill(`Date,Company,Role,LMP ID\n${rows}\n`, []);
    expect(report.totalRows).toBe(13);
    expect(report.inserts).toBe(13);
    expect(report.commitRows).toHaveLength(13);
  });
});
