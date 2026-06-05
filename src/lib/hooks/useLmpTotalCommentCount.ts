import { useMemo } from "react";
import { useLmpComments } from "./useLmpComments";
import { useLmpProcessComment } from "./useLmpProcessComment";

/**
 * Combined comment count for the header badge: DB-side `lmp_comments` plus
 * sheet-only lines from `lmp_processes.comments` (column Z), de-duplicated
 * against DB rows by normalized body so a comment authored in the app and
 * mirrored back from the sheet doesn't double-count.
 */
export function useLmpTotalCommentCount(lmpId: string | null): number {
  const { data: dbComments = [] } = useLmpComments(lmpId);
  const { data: sheetComment = "" } = useLmpProcessComment(lmpId);

  return useMemo(() => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const dbBodies = new Set<string>();
    for (const c of dbComments) {
      // Strip the legacy/bracket/dash formats the sheet uses so we match against
      // the same body text that parseSheetComment produces in the drawer.
      dbBodies.add(norm(c.body));
    }

    const stripPrefix = (line: string): string => {
      const bracketFmt = line.match(
        /^\[\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\]\s+.+?:\s*(.*)$/,
      );
      if (bracketFmt) return bracketFmt[1];
      const appFmt = line.match(/^[—\-]\s+.+?\s+\(\d{1,2}:\d{2}\):\s*(.*)$/);
      if (appFmt) return appFmt[1];
      return line;
    };

    const sheetLines = (sheetComment || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    let extra = 0;
    for (const line of sheetLines) {
      const body = stripPrefix(line);
      if (!dbBodies.has(norm(body)) && !dbBodies.has(norm(line))) extra += 1;
    }

    return dbComments.length + extra;
  }, [dbComments, sheetComment]);
}
