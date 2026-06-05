// Shared helper to send email via the Lovable Gmail connector gateway.
// No password / SMTP required — uses OAuth-managed credentials.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const FROM_EMAIL = "pgpcareerprep@mastersunion.org";
const FROM_NAME = "PGP Career Prep";

function base64UrlEncode(str: string): string {
  // Encode UTF-8 → base64 → base64url
  const utf8 = new TextEncoder().encode(str);
  let binary = "";
  for (const b of utf8) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawMessage(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): string {
  // Encode subject for non-ASCII safety
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`;
  const lines = [
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${opts.to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    opts.html,
  ];
  return base64UrlEncode(lines.join("\r\n"));
}

export async function sendGmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ id: string; threadId: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!GOOGLE_MAIL_API_KEY) throw new Error("GOOGLE_MAIL_API_KEY is not configured (Gmail connector not linked)");

  const raw = buildRawMessage(opts);

  const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
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

export const GMAIL_FROM = FROM_EMAIL;
