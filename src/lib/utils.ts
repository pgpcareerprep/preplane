import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Fire-and-forget a promise. Logs errors and optionally calls a handler.
 * Use for background sync/enrichment work where the user shouldn't wait.
 */
export function runInBackground<T>(
  promise: Promise<T> | (() => Promise<T>),
  opts?: { onError?: (err: unknown) => void; label?: string },
): void {
  const p = typeof promise === "function" ? promise() : promise;
  p.catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(`[bg${opts?.label ? `:${opts.label}` : ""}]`, err);
    opts?.onError?.(err);
  });
}
