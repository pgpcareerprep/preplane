import { describe, expect, it } from "vitest";
import { FetchTimeoutError, withTimeout } from "@/lib/fetchWithTimeout";

describe("fetchWithTimeout", () => {
  it("rejects with FetchTimeoutError when promise exceeds limit", async () => {
    await expect(
      withTimeout(new Promise<string>(() => {}), 20, "Test"),
    ).rejects.toBeInstanceOf(FetchTimeoutError);
  });

  it("resolves when promise settles before timeout", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 500)).resolves.toBe("ok");
  });
});
