type InvokeError = {
  message?: string;
  context?: Response;
};

/** Extract a human-readable message from a Supabase edge-function invoke result. */
export async function getEdgeFunctionErrorMessage(
  error: InvokeError | null | undefined,
  data?: { error?: string; ok?: boolean } | null,
): Promise<string> {
  if (data?.error) return data.error;
  if (!error) return "Unknown error";

  const response = error.context;
  if (response && typeof response.json === "function") {
    try {
      const body = await response.clone().json() as { error?: string; message?: string };
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    } catch {
      // ignore parse failures
    }
  }

  const msg = error.message || "";
  if (msg.includes("non-2xx") && data?.error) return data.error;
  return msg || "Request failed";
}
