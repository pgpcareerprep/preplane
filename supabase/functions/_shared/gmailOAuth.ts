// Gmail send via OAuth refresh token (user consent — no domain-wide delegation).
// Refresh token is stored in system_settings (admin connect flow) or GMAIL_OAUTH_REFRESH_TOKEN secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getAppOrigin } from "./appConfig.ts";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_OAUTH_SETTINGS_KEY = "gmail_oauth";
export const GMAIL_OAUTH_PENDING_KEY = "gmail_oauth_pending";

const PENDING_TTL_MS = 15 * 60 * 1000;

export type GmailOAuthSettings = {
  refresh_token: string;
  sender_email: string;
  connected_at: string;
  connected_by?: string;
};

type GmailOAuthPending = {
  state: string;
  redirect_uri: string;
  expires_at: string;
  created_by?: string;
};

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service role is not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getOAuthClientConfig(): { clientId: string | null; clientSecret: string | null } {
  const clientId =
    Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim() ||
    Deno.env.get("GMAIL_OAUTH_CLIENT_ID")?.trim() ||
    Deno.env.get("GOOGLE_CLIENT_ID")?.trim() ||
    null;
  const clientSecret =
    Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim() ||
    Deno.env.get("GMAIL_OAUTH_CLIENT_SECRET")?.trim() ||
    Deno.env.get("GOOGLE_CLIENT_SECRET")?.trim() ||
    null;
  return { clientId, clientSecret };
}

export function getOAuthClientConfigStatus(): {
  hasClientId: boolean;
  hasClientSecret: boolean;
} {
  const { clientId, clientSecret } = getOAuthClientConfig();
  return { hasClientId: Boolean(clientId), hasClientSecret: Boolean(clientSecret) };
}

export function hasOAuthClientConfigured(): boolean {
  const { clientId, clientSecret } = getOAuthClientConfig();
  return Boolean(clientId && clientSecret);
}

export function getGmailOAuthRedirectUri(): string {
  return `${getAppOrigin()}/settings/notifications`;
}

export async function getStoredOAuthSettings(): Promise<GmailOAuthSettings | null> {
  const fromEnv = Deno.env.get("GMAIL_OAUTH_REFRESH_TOKEN")?.trim();
  if (fromEnv) {
    const sender =
      Deno.env.get("GMAIL_OAUTH_SENDER_EMAIL")?.trim() ||
      Deno.env.get("GOOGLE_DELEGATED_USER")?.trim() ||
      "pgpcareerprep@mastersunion.org";
    return {
      refresh_token: fromEnv,
      sender_email: sender,
      connected_at: "env",
    };
  }

  const sb = getServiceClient();
  const { data } = await sb
    .from("system_settings")
    .select("value")
    .eq("key", GMAIL_OAUTH_SETTINGS_KEY)
    .maybeSingle();

  const value = data?.value as GmailOAuthSettings | null;
  if (!value?.refresh_token?.trim()) return null;
  return {
    refresh_token: value.refresh_token.trim(),
    sender_email: value.sender_email?.trim() || "pgpcareerprep@mastersunion.org",
    connected_at: value.connected_at || "",
    connected_by: value.connected_by,
  };
}

export async function hasGmailOAuthRefreshToken(): Promise<boolean> {
  return Boolean(await getStoredOAuthSettings());
}

/** Non-secret runtime snapshot for email OAuth debugging. */
export async function getOAuthStorageDebug(): Promise<{
  refreshFromEnv: boolean;
  dbRowExists: boolean;
  dbHasRefreshToken: boolean;
  dbSenderEmail: string | null;
  dbConnectedAt: string | null;
  pendingStateExists: boolean;
  pendingStateExpired: boolean | null;
  redirectUri: string;
}> {
  const refreshFromEnv = Boolean(Deno.env.get("GMAIL_OAUTH_REFRESH_TOKEN")?.trim());
  const redirectUri = getGmailOAuthRedirectUri();

  const sb = getServiceClient();
  const [{ data: oauthRow }, { data: pendingRow }] = await Promise.all([
    sb.from("system_settings").select("value").eq("key", GMAIL_OAUTH_SETTINGS_KEY).maybeSingle(),
    sb.from("system_settings").select("value").eq("key", GMAIL_OAUTH_PENDING_KEY).maybeSingle(),
  ]);

  const oauthValue = oauthRow?.value as GmailOAuthSettings | null;
  const pending = pendingRow?.value as GmailOAuthPending | null;
  const pendingStateExists = Boolean(pending?.state);
  const pendingStateExpired = pendingStateExists
    ? new Date(pending!.expires_at).getTime() < Date.now()
    : null;

  return {
    refreshFromEnv,
    dbRowExists: Boolean(oauthRow),
    dbHasRefreshToken: Boolean(oauthValue?.refresh_token?.trim()),
    dbSenderEmail: oauthValue?.sender_email?.trim() || null,
    dbConnectedAt: oauthValue?.connected_at || null,
    pendingStateExists,
    pendingStateExpired,
    redirectUri,
  };
}

export async function saveOAuthPendingState(
  state: string,
  redirectUri: string,
  adminUserId?: string,
): Promise<void> {
  const sb = getServiceClient();
  const pending: GmailOAuthPending = {
    state,
    redirect_uri: redirectUri,
    expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    created_by: adminUserId,
  };
  const { error } = await sb.from("system_settings").upsert({
    key: GMAIL_OAUTH_PENDING_KEY,
    value: pending,
    updated_at: new Date().toISOString(),
    updated_by: adminUserId ?? null,
  });
  if (error) throw new Error(`Failed to store OAuth state: ${error.message}`);
}

export async function consumeOAuthPendingState(state: string): Promise<GmailOAuthPending | null> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("system_settings")
    .select("value")
    .eq("key", GMAIL_OAUTH_PENDING_KEY)
    .maybeSingle();

  const pending = data?.value as GmailOAuthPending | null;
  if (!pending || pending.state !== state) return null;
  if (new Date(pending.expires_at).getTime() < Date.now()) return null;

  await sb.from("system_settings").delete().eq("key", GMAIL_OAUTH_PENDING_KEY);
  return pending;
}

export async function saveOAuthSettings(
  settings: GmailOAuthSettings,
  adminUserId?: string,
): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from("system_settings").upsert({
    key: GMAIL_OAUTH_SETTINGS_KEY,
    value: settings,
    updated_at: new Date().toISOString(),
    updated_by: adminUserId ?? null,
  });
  if (error) throw new Error(`Failed to save Gmail OAuth settings: ${error.message}`);
}

export function buildGmailOAuthAuthorizeUrl(state: string, redirectUri: string): string {
  const { clientId } = getOAuthClientConfig();
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured");

  const senderHint =
    Deno.env.get("GOOGLE_DELEGATED_USER")?.trim() || "pgpcareerprep@mastersunion.org";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SEND_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    include_granted_scopes: "true",
    login_hint: senderHint,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getOAuthClientConfig();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error_description || data.error || JSON.stringify(data);
    throw new Error(`OAuth token refresh failed [${res.status}]: ${msg}`);
  }
  if (!data.access_token) throw new Error("OAuth token refresh returned no access_token");
  return data.access_token as string;
}

export async function getGmailOAuthAccessToken(): Promise<string> {
  const settings = await getStoredOAuthSettings();
  if (!settings?.refresh_token) {
    throw new Error("Gmail OAuth refresh token is not configured");
  }
  return refreshAccessToken(settings.refresh_token);
}

export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string; accessToken: string; senderEmail: string }> {
  const { clientId, clientSecret } = getOAuthClientConfig();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    const msg = tokenData.error_description || tokenData.error || JSON.stringify(tokenData);
    throw new Error(`OAuth code exchange failed [${tokenRes.status}]: ${msg}`);
  }

  const refreshToken = String(tokenData.refresh_token || "").trim();
  const accessToken = String(tokenData.access_token || "").trim();
  if (!refreshToken) {
    throw new Error(
      "Google did not return a refresh token. Revoke prior access for this app in your Google account, then reconnect with prompt=consent.",
    );
  }
  if (!accessToken) throw new Error("OAuth code exchange returned no access_token");

  const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await profileRes.json().catch(() => ({}));
  const senderEmail = String(profile.emailAddress || "").trim();
  if (!senderEmail) {
    throw new Error("Could not resolve sender email from Gmail profile");
  }

  return { refreshToken, accessToken, senderEmail };
}

export async function probeGmailOAuth(): Promise<{
  ok: boolean;
  error?: string;
  senderEmail?: string;
}> {
  try {
    const settings = await getStoredOAuthSettings();
    if (!settings?.refresh_token) {
      return { ok: false, error: "No Gmail OAuth refresh token configured" };
    }
    await refreshAccessToken(settings.refresh_token);
    return { ok: true, senderEmail: settings.sender_email };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
}
