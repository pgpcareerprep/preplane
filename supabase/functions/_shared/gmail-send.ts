// Sends email via Gmail API using a service account with domain-wide delegation.
// Requires GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY Supabase secrets.
// The service account must have domain-wide delegation with the Gmail send scope.

import { getGoogleAccessToken } from "./googleAuth.ts";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_FROM = "pgpcareerprep@mastersunion.org";
const FROM_NAME = "PGP Career Prep";

function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawMessage(opts: { to: string; subject: string; html: string }): string {
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`;
  const lines = [
    `From: ${FROM_NAME} <${GMAIL_FROM}>`,
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

export async function sendGmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ id: string; threadId: string }> {
  const token = await getGoogleAccessToken([GMAIL_SCOPE]);
  const raw = buildRawMessage(opts);

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
    throw new Error(`Gmail API send failed [${res.status}]: ${JSON.stringify(data)}`);
  }
  return { id: data.id, threadId: data.threadId };
}
