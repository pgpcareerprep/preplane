
-- Revoke from PUBLIC (covers both anon and authenticated)
REVOKE ALL ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;

-- Grant has_role back to authenticated only (needed for RLS)
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
