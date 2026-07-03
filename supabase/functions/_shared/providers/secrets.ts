import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type SecretSource = "env" | "vault" | null;

/** Strip whitespace and wrapping quotes from pasted secret values. */
export function normalizeSecretValue(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, "").trim();
}

async function readVaultSecretRpc(name: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return null;
  try {
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/read_vault_secret`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ secret_name: name }),
    });
    if (!rpcRes.ok) return null;
    const val = await rpcRes.json();
    return typeof val === "string" && val.trim() ? val : null;
  } catch {
    return null;
  }
}

/** Direct vault schema read — fallback when read_vault_secret RPC is unavailable. */
async function readVaultSecretDirect(name: string): Promise<string | null> {
  const sbUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!sbUrl || !sbKey) return null;
  try {
    const vaultSb = createClient(sbUrl, sbKey, {
      db: { schema: "vault" },
      auth: { persistSession: false },
    });
    const { data, error } = await vaultSb
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", name)
      .maybeSingle();
    if (error || !data?.decrypted_secret) return null;
    return String(data.decrypted_secret);
  } catch {
    return null;
  }
}

/** Load a secret from env (preferred), then Vault via service-role RPC. */
export async function loadSecretWithSource(
  name: string,
): Promise<{ value: string | null; source: SecretSource }> {
  const rawEnv = Deno.env.get(name);
  if (rawEnv) {
    const val = normalizeSecretValue(rawEnv);
    if (val) return { value: val, source: "env" };
  }
  const vaultRpc = await readVaultSecretRpc(name);
  if (vaultRpc) {
    const val = normalizeSecretValue(vaultRpc);
    if (val) return { value: val, source: "vault" };
  }
  const vaultDirect = await readVaultSecretDirect(name);
  if (vaultDirect) {
    const val = normalizeSecretValue(vaultDirect);
    if (val) return { value: val, source: "vault" };
  }
  return { value: null, source: null };
}

/** Load a secret from env, then Supabase Vault decrypted_secrets. */
export async function loadSecret(name: string): Promise<string | null> {
  const { value } = await loadSecretWithSource(name);
  return value;
}
