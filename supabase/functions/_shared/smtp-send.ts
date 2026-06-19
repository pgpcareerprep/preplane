// Gmail SMTP fallback when service-account domain-wide delegation is unavailable.
// Set GMAIL_APP_PASSWORD (Google App Password) and optionally GMAIL_SMTP_USER.

import nodemailer from "npm:nodemailer@6.9.15";
import { FROM_NAME, GMAIL_FROM } from "./emailConstants.ts";

export function hasSmtpCredentials(): boolean {
  return Boolean(Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("GMAIL_SMTP_PASSWORD"));
}

export async function sendViaSmtp(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ messageId: string }> {
  const pass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("GMAIL_SMTP_PASSWORD");
  if (!pass) {
    throw new Error("GMAIL_APP_PASSWORD secret is not configured");
  }

  const user =
    Deno.env.get("GMAIL_SMTP_USER") ||
    Deno.env.get("GOOGLE_DELEGATED_USER") ||
    GMAIL_FROM;

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });

  const info = await transport.sendMail({
    from: `"${FROM_NAME}" <${user}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  return { messageId: info.messageId || "smtp-sent" };
}
