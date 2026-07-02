import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("external mentor search secrets wiring", () => {
  const secrets = read("supabase/functions/_shared/providers/secrets.ts");
  const ext = read("supabase/functions/external-mentor-search/index.ts");
  const migration = read("supabase/migrations/20260703120000_read_vault_secret_rpc.sql");

  it("strips wrapping quotes and uses vault RPC", () => {
    expect(secrets).toContain("normalizeSecretValue");
    expect(secrets).toContain('replace(/^["\']|["\']$/g, "")');
    expect(secrets).toContain("loadSecretWithSource");
    expect(secrets).toContain("/rest/v1/rpc/read_vault_secret");
    expect(secrets).not.toContain("Accept-Profile");
  });

  it("migration locks down read_vault_secret to service_role", () => {
    expect(migration).toContain("read_vault_secret");
    expect(migration).toContain("GRANT EXECUTE");
    expect(migration).toContain("service_role");
    expect(migration).toContain("REVOKE");
  });

  it("edge function exposes diag mode without leaking full key", () => {
    expect(ext).toContain("body.diag === true");
    expect(ext).toContain("keyLast4");
    expect(ext).toContain("geminiPing");
    expect(ext).not.toMatch(/keyFull|fullKey/i);
  });

  it("jina search logs auth failures distinctly", () => {
    const jina = read("supabase/functions/_shared/providers/search/jina.ts");
    expect(jina).toContain("jina_auth_missing");
  });
});
