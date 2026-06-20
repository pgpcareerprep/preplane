import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PRODUCTION_APP_ORIGIN,
  buildLoginRedirectUrl,
} from "@/lib/appOrigin";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("appOrigin", () => {
  it("uses preplane.pages.dev as production origin", () => {
    expect(PRODUCTION_APP_ORIGIN).toBe("https://preplane.pages.dev");
  });

  it("builds login redirect on canonical host", () => {
    expect(buildLoginRedirectUrl()).toBe("https://preplane.pages.dev/login");
    expect(buildLoginRedirectUrl("/lmp/abc")).toBe(
      "https://preplane.pages.dev/login?redirect=%2Flmp%2Fabc",
    );
  });
});

describe("PKCE auth client", () => {
  it("uses pkce flow with detectSessionInUrl", () => {
    const client = read("src/integrations/supabase/client.ts");
    expect(client).toContain('flowType: "pkce"');
    expect(client).toContain("detectSessionInUrl: true");
    expect(client).not.toContain('flowType: "implicit"');
  });

  it("routes OAuth callbacks to the canonical login URL", () => {
    const lovable = read("src/integrations/lovable/index.ts");
    const login = read("src/pages/LoginPage.tsx");
    expect(lovable).toContain("buildLoginRedirectUrl");
    expect(login).toContain("buildLoginRedirectUrl");
    expect(login).toContain('searchParams.has("code")');
  });
});
