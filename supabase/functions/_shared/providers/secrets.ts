/** Load a secret from env, then Supabase Vault decrypted_secrets. */
export async function loadSecret(name: string): Promise<string | null> {
  const envVal = Deno.env.get(name)?.trim();
  if (envVal) return envVal;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return null;
  try {
    const vaultRes = await fetch(
      `${supabaseUrl}/rest/v1/decrypted_secrets?name=eq.${encodeURIComponent(name)}&select=decrypted_secret&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Accept-Profile": "vault",
        },
      },
    );
    if (!vaultRes.ok) return null;
    const rows = await vaultRes.json();
    const val = rows?.[0]?.decrypted_secret;
    return typeof val === "string" && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}
