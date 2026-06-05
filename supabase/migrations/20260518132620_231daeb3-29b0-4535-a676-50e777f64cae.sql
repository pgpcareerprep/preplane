INSERT INTO storage.buckets (id, name, public)
VALUES ('jds', 'jds', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'jds_public_read'
  ) THEN
    CREATE POLICY "jds_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'jds');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'jds_authenticated_write'
  ) THEN
    CREATE POLICY "jds_authenticated_write"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'jds');
  END IF;
END$$;