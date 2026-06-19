// Generates a short-lived Google OAuth2 access token from a service account private key.
// Requires GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY Supabase secrets.

function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToBase64Url(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  const email = Deno.env.get("GOOGLE_SA_EMAIL");
  const privateKeyPem = Deno.env.get("GOOGLE_SA_PRIVATE_KEY");
  if (!email || !privateKeyPem) {
    throw new Error("GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY secrets are required");
  }

  const delegatedUser = Deno.env.get("GOOGLE_DELEGATED_USER") || "pgpcareerprep@mastersunion.org";
  const needsDelegation = scopes.some((scope) => scope.includes("gmail"));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload: Record<string, string | number> = {
    iss: email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  if (needsDelegation) {
    payload.sub = delegatedUser;
  }

  const headerB64 = textToBase64Url(JSON.stringify(header));
  const payloadB64 = textToBase64Url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get Google access token: ${err}`);
  }

  const data = await tokenRes.json();
  return data.access_token as string;
}

const GMAIL_DELEGATION_SCOPE_SETS = [
  ["https://www.googleapis.com/auth/gmail.send"],
  ["https://mail.google.com/"],
  ["https://www.googleapis.com/auth/gmail.send", "https://mail.google.com/"],
];

/** Gmail send requires domain-wide delegation; tries common authorized scope combinations. */
export async function getGmailAccessToken(): Promise<string> {
  let lastError = "Gmail delegation failed";
  for (const scopes of GMAIL_DELEGATION_SCOPE_SETS) {
    try {
      return await getGoogleAccessToken(scopes);
    } catch (err) {
      lastError = String((err as Error)?.message || err);
    }
  }
  throw new Error(lastError);
}

export async function probeGoogleToken(
  scopes: string[],
  withDelegation: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const email = Deno.env.get("GOOGLE_SA_EMAIL");
  const privateKeyPem = Deno.env.get("GOOGLE_SA_PRIVATE_KEY");
  if (!email || !privateKeyPem) {
    return { ok: false, error: "GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY secrets are required" };
  }

  try {
    const delegatedUser = Deno.env.get("GOOGLE_DELEGATED_USER") || "pgpcareerprep@mastersunion.org";
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload: Record<string, string | number> = {
      iss: email,
      scope: scopes.join(" "),
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };
    if (withDelegation) payload.sub = delegatedUser;

    const headerB64 = textToBase64Url(JSON.stringify(header));
    const payloadB64 = textToBase64Url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(privateKeyPem.replace(/\\n/g, "\n")),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(signingInput),
    );

    const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!tokenRes.ok) {
      return { ok: false, error: await tokenRes.text() };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
}
