export class FetchTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, label = "Request") {
    super(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = "FetchTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** Race any promise against a wall-clock timeout. */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = "Request",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new FetchTimeoutError(timeoutMs, label));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** fetch() with AbortController timeout; maps abort to FetchTimeoutError. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number; timeoutLabel?: string } = {},
): Promise<Response> {
  const { timeoutMs = 15_000, timeoutLabel = "Request", signal: outerSignal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onOuterAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener("abort", onOuterAbort, { once: true });
  }

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new FetchTimeoutError(timeoutMs, timeoutLabel);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener("abort", onOuterAbort);
  }
}
