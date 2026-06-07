import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Loader2, AlertCircle } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  not_approved: "Your account isn't approved yet. Please contact your admin.",
  oauth_failed: "Google sign-in failed. Please try again.",
};

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const redirectTarget = (() => {
    const r = searchParams.get("redirect");
    if (!r) return "/dashboard";
    try {
      const decoded = decodeURIComponent(r);
      if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
    } catch { /* fallthrough */ }
    return "/dashboard";
  })();

  const finishSignIn = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      navigate(redirectTarget, { replace: true });
      return true;
    }
    setLoading(false);
    return false;
  }, [navigate, redirectTarget]);

  useEffect(() => {
    const errKey = searchParams.get("error");
    if (errKey && ERROR_MESSAGES[errKey]) setError(ERROR_MESSAGES[errKey]);
  }, [searchParams]);

  // Redirect as soon as a session exists (either already there, or set after OAuth callback).
  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      void finishSignIn();
    };
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) go();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) go();
    });
    return () => subscription.unsubscribe();
  }, [finishSignIn]);

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/login" +
          (redirectTarget !== "/dashboard"
            ? `?redirect=${encodeURIComponent(redirectTarget)}`
            : ""),
      });

      if (result.error) {
        setError(ERROR_MESSAGES.oauth_failed);
        setLoading(false);
        return;
      }
      if (result.redirected) return; // Browser will redirect
      // Tokens received in-place
      await finishSignIn();
    } catch (err) {
      console.error("Google sign-in error:", err);
      setError(ERROR_MESSAGES.oauth_failed);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-n50 dark:bg-d-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-orange-500 text-[28px] font-bold tracking-tight">
            PrepLene
          </span>
          <p className="mt-2 text-[12px] text-n500 dark:text-d-muted font-normal leading-relaxed tracking-wide">
            Your end-to-end AI-powered career prep platform
          </p>
        </div>

        <div className="bg-white dark:bg-d-surface rounded-xl border border-n200 dark:border-d-border shadow-sm p-6">
          <h2 className="text-lg font-semibold text-n900 dark:text-d-text text-center">
            Login to PrepLene Tool
          </h2>
          <p className="mt-1 text-sm text-n500 dark:text-d-muted text-center">
            Sign in with your official Google account.
          </p>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className={cn(
              "mt-5 w-full flex items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              "bg-white dark:bg-d-surface-2 text-n900 dark:text-d-text",
              "border border-n200 dark:border-d-border hover:bg-n50 dark:hover:bg-d-surface",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            )}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" fill="#34A853"/>
                <path d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
              </svg>
            )}
            {loading ? "Redirecting…" : "Continue with Google"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-n400 dark:text-d-muted">
          Only approved accounts can sign in. Contact your admin if you need access.
        </p>
      </div>
    </div>
  );
}
