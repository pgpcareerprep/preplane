// Non-secret diagnostics for Gmail / Google auth configuration issues.

import { hasSmtpCredentials } from "./smtp-send.ts";
import { probeGoogleToken } from "./googleAuth.ts";

export type EmailDiagnostic = {
  delegatedUser: string;
  serviceAccountEmail: string | null;
  serviceAccountClientId: string | null;
  hasSaEmail: boolean;
  hasPrivateKey: boolean;
  hasSmtpPassword: boolean;
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

  const fixSteps: string[] = [];

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

  if (!saKeyValid) {
    fixSteps.push(
      "Verify GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY Supabase secrets (private key must include -----BEGIN PRIVATE KEY----- with real newlines or \\n escapes).",
    );
  }

  if (saKeyValid && !gmailDelegationAuthorized) {
    fixSteps.push(
      "In Google Cloud Console: open the service account → enable Domain-wide delegation → copy the numeric Client ID.",
    );
    fixSteps.push(
      "In Google Workspace Admin: Security → API controls → Domain-wide delegation → Add client → paste Client ID → authorize scope https://www.googleapis.com/auth/gmail.send",
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

  if (!gmailDelegationAuthorized && !hasSmtpPassword) {
    fixSteps.push(
      "Quick workaround: create a Google App Password for the sender mailbox and set GMAIL_APP_PASSWORD in Supabase secrets.",
    );
  }

  if (hasSmtpPassword) {
    fixSteps.push("GMAIL_APP_PASSWORD is set — SMTP fallback will be used when Gmail API delegation fails.");
  }

  return {
    delegatedUser,
    serviceAccountEmail: saEmail,
    serviceAccountClientId: clientId,
    hasSaEmail: Boolean(saEmail),
    hasPrivateKey,
    hasSmtpPassword,
    saKeyValid,
    saKeyError,
    gmailDelegationAuthorized,
    gmailDelegationError,
    fixSteps,
  };
}
