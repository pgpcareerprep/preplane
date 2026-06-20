import { isCircuitOpen, recordFailure, recordSuccess } from "../circuitBreaker.ts";
import type { Logger } from "../logger.ts";
import { isProviderAllowed } from "./config.ts";

export type ProviderAttempt<T> = {
  name: string;
  free: boolean;
  run: () => Promise<T | null>;
};

export type FallbackResult<T> = {
  result: T | null;
  provider: string | null;
  reason?: string;
};

/**
 * Try providers in order. Under ZERO_SPEND, skips any provider with free === false.
 * Uses per-provider circuit breaker and structured logging.
 */
export async function runWithFallback<T>(
  providers: ProviderAttempt<T>[],
  log: Logger,
): Promise<FallbackResult<T>> {
  for (const p of providers) {
    if (!isProviderAllowed(p.free)) {
      log.info("provider_skipped_paid", { provider: p.name, reason: "zero_spend" });
      continue;
    }
    if (isCircuitOpen(p.name)) {
      log.warn("provider_skipped_circuit_open", { provider: p.name });
      continue;
    }
    try {
      const result = await p.run();
      if (result !== null && result !== undefined) {
        recordSuccess(p.name);
        log.info("provider_success", { provider: p.name });
        return { result, provider: p.name };
      }
      recordFailure(p.name);
      log.warn("provider_empty", { provider: p.name });
    } catch (e) {
      recordFailure(p.name);
      log.warn("provider_error", { provider: p.name, err_msg: (e as Error).message });
    }
  }
  return { result: null, provider: null, reason: "no_free_provider_result" };
}
