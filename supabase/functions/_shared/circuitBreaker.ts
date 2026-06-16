// circuitBreaker.ts — per-cold-start provider health tracking.
// Module-level state persists across requests in a warm Deno instance.
// Circuit states: closed (healthy) → open (failing) → half-open (probe).

const FAILURE_THRESHOLD = 3;  // failures before opening the circuit
const OPEN_DURATION_MS   = 5 * 60 * 1000;  // 5 min cooldown
const PROBE_TIMEOUT_MS   = 30 * 1000;      // single probe after cooldown

interface ProviderHealth {
  consecutiveFailures: number;
  lastFailureAt: number;
  openUntil: number;
  totalFailures: number;
  totalSuccesses: number;
}

const _health = new Map<string, ProviderHealth>();

function get(provider: string): ProviderHealth {
  if (!_health.has(provider)) {
    _health.set(provider, { consecutiveFailures: 0, lastFailureAt: 0, openUntil: 0, totalFailures: 0, totalSuccesses: 0 });
  }
  return _health.get(provider)!;
}

/** Returns true if the circuit is OPEN (provider should be skipped). */
export function isCircuitOpen(provider: string): boolean {
  const h = get(provider);
  if (h.openUntil === 0) return false;
  if (Date.now() < h.openUntil) return true;  // still in cooldown
  // Cooldown elapsed → half-open: allow one probe
  return false;
}

/** Call when a provider request succeeds. */
export function recordSuccess(provider: string): void {
  const h = get(provider);
  h.consecutiveFailures = 0;
  h.openUntil = 0;
  h.totalSuccesses++;
}

/** Call when a provider request fails with a retryable error. */
export function recordFailure(provider: string): void {
  const h = get(provider);
  h.consecutiveFailures++;
  h.lastFailureAt = Date.now();
  h.totalFailures++;
  if (h.consecutiveFailures >= FAILURE_THRESHOLD) {
    h.openUntil = Date.now() + OPEN_DURATION_MS;
    console.warn(`[circuit-breaker] ${provider} circuit OPENED after ${h.consecutiveFailures} failures — cool-down until ${new Date(h.openUntil).toISOString()}`);
  }
}

/** Health summary for telemetry / admin views. */
export function getHealthSnapshot(): Record<string, { open: boolean; failures: number; successes: number }> {
  const snap: Record<string, { open: boolean; failures: number; successes: number }> = {};
  for (const [name, h] of _health.entries()) {
    snap[name] = {
      open: isCircuitOpen(name),
      failures: h.totalFailures,
      successes: h.totalSuccesses,
    };
  }
  return snap;
}
