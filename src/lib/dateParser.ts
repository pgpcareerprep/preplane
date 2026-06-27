/**
 * Robust date parser for free-text progress notes.
 * Handles formats commonly used by POCs in the Google Sheet:
 *
 *   [10/3]              → day/month (current year)
 *   [12/3]              → day/month bracket style
 *   10/3                → day/month without brackets
 *   20-3-26             → day-month-2digitYear
 *   24--3-26            → day--month-year (double dash typo)
 *   26/03//2026         → day/month//fullYear (double slash typo)
 *   19/03/2026          → day/month/fullYear
 *   7th March           → ordinal + month name
 *   23rd March          → ordinal + month name
 *   March 7             → month name + day
 *   2026-03-19          → ISO-style
 */

const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

function resolveYear(y: number | undefined): number {
  if (y === undefined) return new Date().getFullYear();
  if (y < 100) return 2000 + y;
  return y;
}

function isValidDate(d: number, m: number, y: number): boolean {
  const date = new Date(y, m, d);
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
}

export type ParsedDate = {
  date: Date;
  iso: string;        // YYYY-MM-DD
  original: string;   // The matched text
  startIdx: number;
  endIdx: number;
};

const MONTH_NAME_RE = "(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)";

// Ordered from most specific to least specific
const DATE_PATTERNS: Array<{
  regex: RegExp;
  extract: (m: RegExpMatchArray) => { d: number; m: number; y?: number } | null;
}> = [
  // ISO: 2026-03-19
  {
    regex: /(\d{4})-(\d{1,2})-(\d{1,2})/g,
    extract: (m) => ({ y: +m[1], m: +m[2] - 1, d: +m[3] }),
  },
  // dd/mm//yyyy or dd/mm/yyyy (with optional double slash typo)
  {
    regex: /(\d{1,2})[/](\d{1,2})[/]{1,2}(\d{4})/g,
    extract: (m) => ({ d: +m[1], m: +m[2] - 1, y: +m[3] }),
  },
  // dd/mm/yy (two-digit year with slashes)
  {
    regex: /(\d{1,2})[/](\d{1,2})[/](\d{2})(?!\d)/g,
    extract: (m) => ({ d: +m[1], m: +m[2] - 1, y: +m[3] }),
  },
  // dd-mm-yyyy or dd--mm-yyyy or dd-mm-yy (with optional double dash typo)
  {
    regex: /(\d{1,2})-{1,2}(\d{1,2})-{1,2}(\d{2,4})/g,
    extract: (m) => ({ d: +m[1], m: +m[2] - 1, y: +m[3] }),
  },
  // [dd/mm] bracket style
  {
    regex: /\[(\d{1,2})[/](\d{1,2})\]/g,
    extract: (m) => ({ d: +m[1], m: +m[2] - 1 }),
  },
  // dd/mm (bare, no year) — only match when NOT part of a longer date
  {
    regex: /(?<!\d[/])(\d{1,2})[/](\d{1,2})(?![/]\d)/g,
    extract: (m) => {
      const d = +m[1], mo = +m[2];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { d, m: mo - 1 };
      return null;
    },
  },
  // "7th March", "23rd March", "1st April", "2nd May" (with optional year)
  {
    regex: new RegExp(`(\\d{1,2})(?:st|nd|rd|th)\\s+(${MONTH_NAME_RE})(?:\\s+(\\d{2,4}))?`, "gi"),
    extract: (m) => {
      const mon = MONTH_NAMES[m[2].toLowerCase()];
      if (mon === undefined) return null;
      return { d: +m[1], m: mon, y: m[3] ? +m[3] : undefined };
    },
  },
  // "March 7" or "March 7, 2026"
  {
    regex: new RegExp(`(${MONTH_NAME_RE})\\s+(\\d{1,2})(?:,?\\s+(\\d{2,4}))?`, "gi"),
    extract: (m) => {
      const mon = MONTH_NAMES[m[1].toLowerCase()];
      if (mon === undefined) return null;
      return { d: +m[2], m: mon, y: m[3] ? +m[3] : undefined };
    },
  },
];

/**
 * Extract all recognizable dates from a free-text string.
 * Returns them sorted chronologically.
 */
export function extractDates(text: string): ParsedDate[] {
  const results: ParsedDate[] = [];
  const usedRanges: Array<[number, number]> = [];

  const overlaps = (s: number, e: number) =>
    usedRanges.some(([us, ue]) => s < ue && e > us);

  for (const pattern of DATE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      const startIdx = match.index;
      const endIdx = startIdx + match[0].length;

      if (overlaps(startIdx, endIdx)) continue;

      const parsed = pattern.extract(match);
      if (!parsed) continue;

      const year = resolveYear(parsed.y);
      if (!isValidDate(parsed.d, parsed.m, year)) continue;

      const date = new Date(year, parsed.m, parsed.d);
      const iso = `${year}-${String(parsed.m + 1).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;

      results.push({ date, iso, original: match[0], startIdx, endIdx });
      usedRanges.push([startIdx, endIdx]);
    }
  }

  return results.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Parse a "Daily Progress" cell into structured timeline entries.
 * Splits on newlines, assigns each line to the most recent date found
 * in that line or in preceding lines.
 */
export type ProgressTimelineEntry = {
  date: string;        // YYYY-MM-DD
  dateDisplay: string; // e.g. "10 Mar 2026"
  text: string;        // The progress note (date portion stripped)
  raw: string;         // Original line
};

export function parseDailyProgress(rawText: string): ProgressTimelineEntry[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/\n/).map(l => l.trim()).filter(Boolean);
  const entries: ProgressTimelineEntry[] = [];

  for (const line of lines) {
    const isUrlOnly = /^https?:\/\//i.test(line.trim());
    const dates = isUrlOnly ? [] : extractDates(line);
    const lineDate = dates.length > 0 ? dates[0] : null;
    const dateStr = lineDate?.iso ?? "";
    const dateObj = lineDate?.date ?? null;

    // Strip date patterns from the text for cleaner display
    let cleanText = line;
    if (dates.length > 0) {
      for (const d of dates) {
        cleanText = cleanText.replace(d.original, "").trim();
      }
    }
    // Clean up leading/trailing punctuation after date removal
    cleanText = cleanText.replace(/^[-–—:,.\s]+/, "").replace(/[-–—:,.\s]+$/, "").trim();

    if (!cleanText) continue;

    entries.push({
      date: dateStr,
      dateDisplay: dateObj
        ? dateObj.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "",
      text: cleanText,
      raw: line,
    });
  }

  return entries;
}

/**
 * Convert any recognized date string/format to YYYY-MM-DD.
 * Returns null if no date could be parsed.
 */
export function normalizeDate(input: string): string | null {
  const dates = extractDates(input);
  return dates.length > 0 ? dates[0].iso : null;
}
