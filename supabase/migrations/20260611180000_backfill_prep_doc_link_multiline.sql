-- =============================================================================
-- Backfill prep_doc_link with all links from prep_doc JSON array.
--
-- New format: "Label: URL\nLabel2: URL2\n..." (multi-line).
-- Only updates rows where prep_doc is a valid JSON array with at least one URL.
--
-- Also re-enqueues all affected LMPs so the new multi-line value reaches
-- the live sheet via the normal sheets-lmp Edge Function queue.
-- =============================================================================

-- ── 1. Backfill ───────────────────────────────────────────────────────────────

UPDATE public.lmp_processes
SET
  prep_doc_link = (
    SELECT string_agg(
      CASE
        WHEN (doc->>'label') IS NOT NULL
          AND length(trim(doc->>'label')) > 0
          AND trim(doc->>'label') != 'Document'
        THEN trim(doc->>'label') || ': ' || trim(doc->>'url')
        ELSE trim(doc->>'url')
      END,
      E'\n'
      ORDER BY
        COALESCE(doc->>'updated_at', doc->>'created_at', '1970-01-01') DESC
    )
    FROM jsonb_array_elements(prep_doc::jsonb) AS doc
    WHERE (doc->>'url') IS NOT NULL
      AND trim(doc->>'url') != ''
  ),
  sync_source = 'backfill_prep_doc_link'
WHERE
  prep_doc IS NOT NULL
  AND length(trim(prep_doc)) > 2
  AND left(trim(prep_doc), 1) = '['
  AND (
    -- Only update rows where prep_doc has actual content
    jsonb_typeof(
      CASE WHEN left(trim(prep_doc), 1) = '['
      THEN prep_doc::jsonb
      ELSE '[]'::jsonb
      END
    ) = 'array'
  );


-- ── 2. Re-enqueue all LMPs with prep_doc_link set ────────────────────────────

DO $$
DECLARE
  lmp_rec RECORD;
  n int := 0;
BEGIN
  FOR lmp_rec IN
    SELECT id, lmp_code
    FROM public.lmp_processes
    WHERE prep_doc_link IS NOT NULL
      AND prep_doc_link <> ''
      AND lmp_code IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.enqueue_lmp_sheet_mirror_by_id(lmp_rec.id, 'backfill_prep_doc_link');
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Re-enqueue failed for % (%): %', lmp_rec.lmp_code, lmp_rec.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Enqueued % LMPs for prep_doc_link backfill sync', n;
END;
$$;
