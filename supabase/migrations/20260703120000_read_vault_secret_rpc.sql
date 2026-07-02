-- Service-role RPC to read Supabase Vault secrets (PostgREST cannot expose vault schema directly).

CREATE OR REPLACE FUNCTION public.read_vault_secret(secret_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret::text
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.read_vault_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_vault_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.read_vault_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.read_vault_secret(text) TO service_role;
