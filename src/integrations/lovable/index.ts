// Thin wrapper around Supabase native OAuth — replaces Lovable cloud-auth-js.
import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple" | "microsoft", opts?: SignInOptions) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider === "microsoft" ? "azure" : provider,
        options: {
          redirectTo: opts?.redirect_uri ?? window.location.origin + "/login",
          queryParams:
            provider === "google"
              ? { access_type: "offline", prompt: "select_account" }
              : undefined,
        },
      });
      if (error) return { error, redirected: false };
      return { redirected: true, error: null };
    },
  },
};
