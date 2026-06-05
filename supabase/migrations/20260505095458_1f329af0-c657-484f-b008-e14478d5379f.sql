
-- Revoke anon execution on has_role
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM anon;

-- Revoke anon execution on handle_new_user (trigger-only)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- Revoke anon on update_updated_at_column (trigger-only)
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM authenticated;
