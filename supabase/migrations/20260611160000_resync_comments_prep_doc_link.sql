-- =============================================================================
-- Re-enqueue LMPs with comments or prep_doc_link so they sync to the sheet
-- now that DB_TO_SHEET includes both columns.
--
-- Background: fieldMap.ts was missing `comments: "Comments"` and
-- `prep_doc_link: "Prep Doc Link"`. The DB trigger has been sending these
-- fields in the payload all along, but sheets-lmp was skipping them because
-- reverseFieldMap had no entry for them. This migration triggers a re-sync so
-- existing values reach the sheet without waiting for the next manual update.
-- =============================================================================

DO $$
DECLARE
  lmp_rec RECORD;
  n int := 0;
BEGIN
  FOR lmp_rec IN
    SELECT id, lmp_code
    FROM public.lmp_processes
    WHERE lmp_code IS NOT NULL
      AND (
        (comments    IS NOT NULL AND comments    <> '')
        OR (prep_doc_link IS NOT NULL AND prep_doc_link <> '')
      )
  LOOP
    BEGIN
      PERFORM public.enqueue_lmp_sheet_mirror_by_id(lmp_rec.id, 'resync_comments_prep_doc_link');
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Re-enqueue failed for % (%): %', lmp_rec.lmp_code, lmp_rec.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Queued % LMP(s) for re-sync', n;
END $$;
