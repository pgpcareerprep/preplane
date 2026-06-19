import { NEXT_PROGRESS_TYPES } from "./nextProgressType.ts";
import type { SheetsClient } from "./sheets.ts";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export async function applyNextProgressTypeSheetValidation(
  sheetsClient: SheetsClient,
  spreadsheetId: string,
  tabTitle: string,
  headerRow: number,
  columnIndex: number,
): Promise<void> {
  if (columnIndex < 0) return;

  const metaRes = await sheetsClient.rawFetch(
    `${SHEETS_BASE}/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
  );
  if (!metaRes.ok) {
    console.warn("[next-progress-type] failed to load sheet metadata:", await metaRes.text());
    return;
  }
  const meta = await metaRes.json();
  const sheet = (meta.sheets ?? []).find((s: { properties?: { title?: string } }) =>
    s.properties?.title === tabTitle
  );
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId == null) return;

  const validationRes = await sheetsClient.rawFetch(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: headerRow,
            endRowIndex: 10000,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          rule: {
            condition: {
              type: "ONE_OF_LIST",
              values: NEXT_PROGRESS_TYPES.map((value) => ({ userEnteredValue: value })),
            },
            strict: false,
            showCustomUi: true,
          },
        },
      }],
    }),
  });
  if (!validationRes.ok) {
    console.warn("[next-progress-type] validation update failed:", await validationRes.text());
  }
}

export function findNextProgressTypeColumnIndex(headers: string[]): number {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return headers.findIndex((h) => norm(String(h ?? "")) === norm("Next Progress Type"));
}
