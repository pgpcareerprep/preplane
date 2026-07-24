/**
 * Progress-overdue helpers.
 *
 * An LMP is overdue when its next expected progress date is before today
 * AND there has been no progress update after that due date.
 *
 * Logging progress after a missed date clears overdue even if the stale
 * next_progress_date has not been moved forward yet.
 */

export function startOfLocalDay(d: Date = new Date()): Date {
  return new Date(d.toDateString());
}

/**
 * True when nextExpectedProgress is a valid date strictly before today.
 */
export function isNextProgressDatePast(
  nextExpectedProgress: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!nextExpectedProgress) return false;
  const due = new Date(nextExpectedProgress);
  if (isNaN(due.getTime())) return false;
  return due < startOfLocalDay(now);
}

/**
 * True when the LMP still needs a progress update for a past next-progress date.
 *
 * If `lastProgressUpdatedAt` is after the due date, the miss was already
 * addressed — not overdue (even if the next date field was left stale).
 */
export function isProgressOverdue(
  nextExpectedProgress: string | null | undefined,
  lastProgressUpdatedAt?: string | null,
  now: Date = new Date(),
): boolean {
  if (!isNextProgressDatePast(nextExpectedProgress, now)) return false;
  const due = new Date(nextExpectedProgress!);
  if (lastProgressUpdatedAt) {
    const updated = new Date(lastProgressUpdatedAt);
    if (!isNaN(updated.getTime()) && updated > due) return false;
  }
  return true;
}
