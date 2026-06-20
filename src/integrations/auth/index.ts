import { supabase } from "../supabase/client";
import { buildLoginRedirectUrl } from "@/lib/appOrigin";

type SignInOptions = {
  redirect_uri?: string;
};

export async function signInWithOAuth(
  provider: "google" | "apple" | "microsoft",
  opts?: SignInOptions,
) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: provider === "microsoft" ? "azure" : provider,
    options: {
      redirectTo: opts?.redirect_uri ?? buildLoginRedirectUrl(),
      queryParams:
        provider === "google"
          ? { access_type: "offline", prompt: "select_account" }
          : undefined,
    },
  });
  if (error) return { error, redirected: false };
  return { redirected: true, error: null };
}
