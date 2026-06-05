/**
 * Legacy entrypoint kept so existing call sites compile.
 *
 * The DB write to `lmp_processes.mentor_selected` is already mirrored to the
 * sheet by the `enqueue_lmp_sheet_mirror` trigger → `sheet_write_queue` →
 * `sheets-retry-sweeper` cron. No frontend push needed.
 */
export async function pushMentorSelectedToSheet(
  _lmpId: string,
  _mentorSelected: string | null,
): Promise<void> {
  return;
}
