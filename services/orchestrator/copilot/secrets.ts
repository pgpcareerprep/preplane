import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { normalizeSecretValue } from "../../../supabase/functions/_shared/providers/secrets.ts";

type SupabaseLike = ReturnType<typeof createClient>;

const _vault: Map<string, string> = new Map();
let _vaultLoaded = false;

export async function ensureVaultLoaded(): Promise<void> {
  if (_vaultLoaded) return;
  _vaultLoaded = true;
  try {
    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vaultSb = createClient(sbUrl, sbKey, {
      db: { schema: "vault" },
      auth: { persistSession: false },
    });
    const { data, error } = await (vaultSb as SupabaseLike)
      .from("decrypted_secrets")
      .select("name,decrypted_secret");
    if (error) {
      console.warn("[copilot-ai] vault query error (non-fatal):", error.message);
      return;
    }
    for (const row of (data ?? []) as Array<{ name: string; decrypted_secret: string }>) {
      if (row.name && row.decrypted_secret) {
        const val = normalizeSecretValue(row.decrypted_secret);
        if (val) _vault.set(row.name, val);
      }
    }
    console.log(`[copilot-ai] vault loaded ${_vault.size} secrets`);
  } catch (e) {
    console.warn("[copilot-ai] vault load skipped (non-fatal):", (e as Error).message);
  }
}

export function getVaultSecret(name: string): string | undefined {
  return _vault.get(name);
}

export function getEnv(name: string): string | undefined {
  const rawEnv = Deno.env.get(name);
  if (rawEnv) {
    const val = normalizeSecretValue(rawEnv);
    if (val) return val;
  }
  return _vault.get(name) || undefined;
}
