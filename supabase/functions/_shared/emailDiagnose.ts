// Non-secret diagnostics for Gmail / Google auth configuration issues.

import { hasSmtpCredentials } from "./smtp-send.ts";
import { probeGoogleToken } from "./googleAuth.ts";
import {
  getGmailOAuthRedirectUri,
  getOAuthClientConfigStatus,
  getStoredOAuthSettings,
  hasGmailOAuthRefreshToken,
  hasOAuthClientConfigured,
  probeGmailOAuth,
} from "./gmailOAuth.ts";

export type EmailDiagnostic = {
  delegatedUser: string;
  serviceAccountEmail: string | null;
  serviceAccountClientId: string | null;
  hasSaEmail: boolean;
  hasPrivateKey: boolean;
  hasSmtpPassword: boolean;
  hasOAuthClient: boolean;
  hasOAuthClientId: boolean;
  hasOAuthClientSecret: boolean;
  hasOAuthRefreshToken: boolean;
  oauthAuthorized: boolean;
  oauthSenderEmail: string | null;
  oauthError: string | null;
  oauthRedirectUri: string;
  saKeyValid: boolean;
  saKeyError: string | null;
  gmailDelegationAuthorized: boolean;
  gmailDelegationError: string | null;
  fixSteps: string[];
};

function parseGoogleTokenError(raw: string): string {
  try {
    const json = JSON.parse(raw);
    return json.error_description || json.error || raw;
  } catch {
    return raw;
  }
}

export async function diagnoseEmailAuth(): Promise<EmailDiagnostic> {
  const saEmail = Deno.env.get("GOOGLE_SA_EMAIL") || null;
  const delegatedUser = Deno.env.get("GOOGLE_DELEGATED_USER") || "pgpcareerprep@mastersunion.org";
  const clientId = Deno.env.get("GOOGLE_SA_CLIENT_ID") || null;
  const hasPrivateKey = Boolean(Deno.env.get("GOOGLE_SA_PRIVATE_KEY"));
  const hasSmtpPassword = hasSmtpCredentials();
  const hasOAuthClient = hasOAuthClientConfigured();
  const { hasClientId: hasOAuthClientId, hasClientSecret: hasOAuthClientSecret } =
    getOAuthClientConfigStatus();
  const hasOAuthRefreshToken = await hasGmailOAuthRefreshToken();
  const oauthRedirectUri = getGmailOAuthRedirectUri();

  const fixSteps: string[] = [];

  const oauthProbe = hasOAuthRefreshToken ? await probeGmailOAuth() : { ok: false as const };
  const oauthAuthorized = oauthProbe.ok;
  const oauthError = oauthProbe.ok ? null : (oauthProbe.error || null);
  const oauthSettings = await getStoredOAuthSettings();
  const oauthSenderEmail = oauthSettings?.sender_email || oauthProbe.senderEmail || null;

  // Verify service account key signs correctly (Sheets scope, no delegation).
  const saProbe = await probeGoogleToken(["https://www.googleapis.com/auth/spreadsheets"], false);
  const saKeyValid = saProbe.ok;
  const saKeyError = saProbe.ok ? null : parseGoogleTokenError(saProbe.error || "unknown");

  // Verify Gmail delegation (gmail.send scope with sub).
  const gmailProbe = await probeGoogleToken(["https://www.googleapis.com/auth/gmail.send"], true);
  let gmailDelegationAuthorized = gmailProbe.ok;
  let gmailDelegationError = gmailProbe.ok
    ? null
    : parseGoogleTokenError(gmailProbe.error || "unknown");

  // H5: Admin may have authorized mail.google.com instead of gmail.send.
  if (!gmailDelegationAuthorized) {
    const mailProbe = await probeGoogleToken(["https://mail.google.com/"], true);
    if (mailProbe.ok) {
      gmailDelegationAuthorized = true;
      gmailDelegationError = null;
    }
  }

  if (!oauthAuthorized && !gmailDelegationAuthorized && !hasSmtpPassword) {
    fixSteps.push(
      "Recommended: set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, add redirect URI in Google Cloud Console, then use Connect Gmail on this page.",
    );
    fixSteps.push(`OAuth redirect URI to authorize: ${oauthRedirectUri}`);
    fixSteps.push("OAuth scope: https://www.googleapis.com/auth/gmail.send");
    fixSteps.push(`Sign in with the sender mailbox (e.g. ${delegatedUser}) when connecting.`);
  }

  if (!hasOAuthClient && !gmailDelegationAuthorized && !hasSmtpPassword) {
    if (!hasOAuthClientId && !hasOAuthClientSecret) {
      fixSteps.push(
        "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET Supabase secrets (Web application OAuth client).",
      );
    } else if (hasOAuthClientId && !hasOAuthClientSecret) {
      fixSteps.push("GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_OAUTH_CLIENT_SECRET is missing in Supabase secrets.");
    } else if (!hasOAuthClientId && hasOAuthClientSecret) {
      fixSteps.push("GOOGLE_OAUTH_CLIENT_SECRET is set but GOOGLE_OAUTH_CLIENT_ID is missing in Supabase secrets.");
    }
  }

  if (hasOAuthClient && !hasOAuthRefreshToken && !gmailDelegationAuthorized && !hasSmtpPassword) {
    fixSteps.push("Click Connect Gmail below to authorize sending from your Google account.");
  }

  if (hasOAuthRefreshToken && !oauthAuthorized) {
    fixSteps.push("Gmail OAuth refresh token is present but invalid — reconnect Gmail or update GMAIL_OAUTH_REFRESH_TOKEN.");
    if (oauthError) fixSteps.push(`OAuth error: ${oauthError}`);
  }

  if (!saKeyValid) {
    fixSteps.push(
      "Verify GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY Supabase secrets (private key must include -----BEGIN PRIVATE KEY----- with real newlines or \\n escapes).",
    );
  }

  if (saKeyValid && !gmailDelegationAuthorized && !oauthAuthorized && !hasSmtpPassword) {
    fixSteps.push(
      "Alternative: In Google Cloud Console open the service account → enable Domain-wide delegation → copy the numeric Client ID.",
    );
    fixSteps.push(
      "In Google Workspace Admin: Security → API controls → Domain-wide delegation → Add client → authorize scope https://www.googleapis.com/auth/gmail.send",
    );
    if (clientId) {
      fixSteps.push(`Use this Client ID in Admin Console: ${clientId}`);
    } else {
      fixSteps.push(
        "Optional: set GOOGLE_SA_CLIENT_ID Supabase secret to surface the Client ID in this diagnostic.",
      );
    }
    fixSteps.push(`Delegated mailbox (sub): ${delegatedUser}`);
  }

  if (!oauthAuthorized && !gmailDelegationAuthorized && !hasSmtpPassword) {
    fixSteps.push(
      "Quick workaround: create a Google App Password for the sender mailbox and set GMAIL_APP_PASSWORD in Supabase secrets.",
    );
  }

  if (oauthAuthorized) {
    fixSteps.push(
      `Gmail OAuth is connected${oauthSenderEmail ? ` as ${oauthSenderEmail}` : ""} — reminders will send via OAuth.`,
    );
  } else if (hasSmtpPassword) {
    fixSteps.push("GMAIL_APP_PASSWORD is set — SMTP fallback will be used when OAuth and delegation are unavailable.");
  }

  return {
    delegatedUser,
    serviceAccountEmail: saEmail,
    serviceAccountClientId: clientId,
    hasSaEmail: Boolean(saEmail),
    hasPrivateKey,
    hasSmtpPassword,
    hasOAuthClient,
    hasOAuthClientId,
    hasOAuthClientSecret,
    hasOAuthRefreshToken,
    oauthAuthorized,
    oauthSenderEmail,
    oauthError,
    oauthRedirectUri,
    saKeyValid,
    saKeyError,
    gmailDelegationAuthorized,
    gmailDelegationError,
    fixSteps,
  };
}

export function emailAuthReadyToSend(diagnostic: EmailDiagnostic): boolean {
  return diagnostic.oauthAuthorized || diagnostic.gmailDelegationAuthorized || diagnostic.hasSmtpPassword;
}
