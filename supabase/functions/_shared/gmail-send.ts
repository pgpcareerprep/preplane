// Sends email via Gmail API.
// Priority: OAuth refresh token → SMTP app password → service-account domain-wide delegation.

import { getGmailAccessToken } from "./googleAuth.ts";
import { FROM_NAME, GMAIL_FROM } from "./emailConstants.ts";
import { sendViaSmtp, hasSmtpCredentials } from "./smtp-send.ts";
import {
  getGmailOAuthAccessToken,
  getStoredOAuthSettings,
  hasGmailOAuthRefreshToken,
  hasOAuthClientConfigured,
} from "./gmailOAuth.ts";

export { GMAIL_FROM } from "./emailConstants.ts";

const CONNECT_GMAIL_HINT =
  "Open Settings → Notifications and click Connect Gmail sender (sign in as pgpcareerprep@mastersunion.org).";

function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawMessage(opts: {
  to: string;
  subject: string;
  html: string;
  fromEmail?: string;
}): string {
  const fromEmail = opts.fromEmail || GMAIL_FROM;
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`;
  const lines = [
    `From: ${FROM_NAME} <${fromEmail}>`,
    `To: ${opts.to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    opts.html,
  ];
  return base64UrlEncode(new TextEncoder().encode(lines.join("\r\n")));
}

function delegationSendError(delegatedUser: string, status: number, data: Record<string, unknown>): string {
  const reason = (data?.error as { reason?: string } | undefined)?.reason;
  const message = (data?.error as { message?: string } | undefined)?.message;
  if (reason === "failedPrecondition" || message === "Precondition check failed.") {
    return [
      `Gmail delegation cannot send as ${delegatedUser} (domain-wide delegation is not fully authorized).`,
      hasOAuthClientConfigured()
        ? CONNECT_GMAIL_HINT
        : "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, then connect Gmail — or set GMAIL_APP_PASSWORD.",
    ].join(" ");
  }
  return `Gmail API send failed for ${delegatedUser} [${status}]: ${JSON.stringify(data)}`;
}

async function sendViaOAuthGmailApi(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string; threadId: string; method: "gmail-oauth" }> {
  const settings = await getStoredOAuthSettings();
  const senderEmail = settings?.sender_email || GMAIL_FROM;
  const token = await getGmailOAuthAccessToken();
  const raw = buildRawMessage({ ...opts, fromEmail: senderEmail });

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Gmail OAuth API send failed for ${senderEmail} [${res.status}]: ${JSON.stringify(data)}`,
    );
  }
  return { id: data.id, threadId: data.threadId, method: "gmail-oauth" };
}

async function sendViaDelegatedGmailApi(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string; threadId: string; method: "gmail-api" }> {
  const delegatedUser = Deno.env.get("GOOGLE_DELEGATED_USER") || "pgpcareerprep@mastersunion.org";
  const token = await getGmailAccessToken();
  const raw = buildRawMessage(opts);

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(delegatedUser)}/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(delegationSendError(delegatedUser, res.status, data as Record<string, unknown>));
  }
  return { id: data.id, threadId: data.threadId, method: "gmail-api" };
}

export async function sendGmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ id: string; threadId: string; method?: string }> {
  const errors: string[] = [];
  const hasOAuthClient = hasOAuthClientConfigured();
  const hasRefreshToken = await hasGmailOAuthRefreshToken();

  if (hasRefreshToken) {
    try {
      return await sendViaOAuthGmailApi(opts);
    } catch (oauthErr) {
      errors.push(String((oauthErr as Error)?.message || oauthErr));
    }
  }

  if (hasSmtpCredentials()) {
    try {
      const smtp = await sendViaSmtp(opts);
      return { id: smtp.messageId, threadId: "", method: "smtp" };
    } catch (smtpErr) {
      errors.push(String((smtpErr as Error)?.message || smtpErr));
    }
  }

  if (hasOAuthClient && !hasRefreshToken) {
    throw new Error(
      `Gmail OAuth client is configured but not connected. ${CONNECT_GMAIL_HINT}`,
    );
  }

  const hasSa = Boolean(Deno.env.get("GOOGLE_SA_EMAIL") && Deno.env.get("GOOGLE_SA_PRIVATE_KEY"));
  if (hasSa) {
    try {
      return await sendViaDelegatedGmailApi(opts);
    } catch (delegationErr) {
      errors.push(String((delegationErr as Error)?.message || delegationErr));
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" | "));
  }

  throw new Error(
    `No email transport configured. ${hasOAuthClient ? CONNECT_GMAIL_HINT : "Set GOOGLE_OAUTH_CLIENT_ID/SECRET or GMAIL_APP_PASSWORD in Supabase secrets."}`,
  );
}
