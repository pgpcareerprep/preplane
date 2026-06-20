import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { signInWithOAuth } from "@/integrations/auth";
import { PrepLaneLogo } from "@/components/brand/PrepLaneLogo";
import { useRole } from "@/lib/rolesContext";
import { buildLoginRedirectUrl, redirectToCanonicalOriginIfNeeded } from "@/lib/appOrigin";
import { cn } from "@/lib/utils";
import { Loader2, AlertCircle } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  not_approved: "Your account isn't approved yet. Please contact your admin.",
  oauth_failed: "Google sign-in failed. Please try again.",
};

function hasAuthCallback(searchParams: URLSearchParams): boolean {
  return (
    searchParams.has("code") ||
    window.location.hash.includes("access_token=")
  );
}

function cleanAuthCallbackFromUrl() {
  const params = new URLSearchParams(window.location.search);
  params.delete("code");
  params.delete("state");
  const qs = params.toString();
  window.history.replaceState(
    {},
    document.title,
    window.location.pathname + (qs ? `?${qs}` : ""),
  );
}

export default function LoginPage() {
  // Watch RoleProvider's auth state — it runs the actual profile/approval check.
  const { isAuthenticated, isLoading: authLoading } = useRole();

  const [signInLoading, setSignInLoading] = useState(false);
  // True while we're waiting for the OAuth callback to be processed.
  const [oauthPending, setOauthPending] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const redirectTarget = useMemo(() => {
    const r = searchParams.get("redirect");
    if (!r) return "/dashboard";
    try {
      const decoded = decodeURIComponent(r);
      if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
    } catch { /* fallthrough */ }
    return "/dashboard";
  }, [searchParams]);

  useEffect(() => {
    redirectToCanonicalOriginIfNeeded();
  }, []);

  // On mount: show any ?error= message and mark that we're processing an OAuth callback.
  // Do NOT clear code/hash here — Supabase processes the callback asynchronously via
  // detectSessionInUrl; clearing early prevents the session from being established.
  useEffect(() => {
    const errKey = searchParams.get("error");
    if (errKey && ERROR_MESSAGES[errKey]) {
      setError(ERROR_MESSAGES[errKey]);
    }

    if (hasAuthCallback(searchParams)) {
      setOauthPending(true);
      if (import.meta.env.DEV) {
        console.log("[auth] OAuth callback detected — waiting for Supabase to process session");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // Navigate to dashboard once RoleProvider confirms the user is authenticated.
  useEffect(() => {
    if (authLoading) return;

    if (isAuthenticated) {
      if (hasAuthCallback(searchParams) || window.location.hash.includes("access_token=")) {
        cleanAuthCallbackFromUrl();
      }
      if (import.meta.env.DEV) {
        console.log("[auth] Authenticated — navigating to", redirectTarget);
      }
      navigate(redirectTarget, { replace: true });
      return;
    }

    // Auth resolved but user is not authenticated. Stop the pending spinner.
    // RoleProvider redirects to ?error=not_approved if the profile check failed.
    if (oauthPending) setOauthPending(false);
    if (signInLoading) setSignInLoading(false);
  }, [authLoading, isAuthenticated, navigate, redirectTarget, oauthPending, signInLoading, searchParams]);

  const isLoading = signInLoading || oauthPending || authLoading;

  const handleGoogleSignIn = async () => {
    setError("");
    setSignInLoading(true);
    try {
      const result = await signInWithOAuth("google", {
        redirect_uri: buildLoginRedirectUrl(redirectTarget),
      });

      if (result.error) {
        setError(ERROR_MESSAGES.oauth_failed);
        setSignInLoading(false);
        return;
      }
      // result.redirected = true — browser is navigating away to Google.
    } catch (err) {
      console.error("[auth] Google sign-in error:", err);
      setError(ERROR_MESSAGES.oauth_failed);
      setSignInLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 lumina">
      <div className="w-full max-w-form">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex justify-center">
            <PrepLaneLogo size="lg" />
          </div>
          <p className="mt-2 text-[14px] text-muted-foreground font-normal leading-relaxed">
            Your end-to-end <span className="font-display text-orange-500">AI-powered</span> career prep platform
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <h2 className="text-lg font-semibold text-foreground text-center">
            Login to PrepLane Tool
          </h2>
          <p className="mt-1 text-sm text-muted-foreground text-center">
            Sign in with your official Google account.
          </p>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-coral-50 dark:bg-coral-400/10 border border-coral-200 dark:border-coral-400/30 p-3">
              <AlertCircle className="h-4 w-4 text-coral-400 mt-0.5 shrink-0" />
              <p className="text-sm text-coral-600 dark:text-coral-400">{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className={cn(
              "mt-5 w-full flex items-center justify-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium transition-colors duration-150",
              "bg-card text-foreground border border-border hover:bg-muted",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" fill="#34A853"/>
                <path d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
              </svg>
            )}
            {isLoading ? "Signing in…" : "Continue with Google"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Only approved accounts can sign in. Contact your admin if you need access.
        </p>
      </div>
    </div>
  );
}
