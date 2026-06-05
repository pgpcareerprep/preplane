// Tiny structured logger for edge functions.
// Emits single-line JSON so logs are queryable in Supabase analytics.
//
// Usage:
//   const log = createLogger("voice-copilot", req);
//   log.info("started", { userId });
//   log.warn("rate_limited", { remaining: 0 });
//   log.error("ai_call_failed", err, { round });
//   log.event("tool_call", { name, args });
//   await log.timed("db_query", async () => doWork());

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  fn: string;
  reqId: string;
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, err?: unknown, fields?: Record<string, unknown>): void;
  event(event: string, fields?: Record<string, unknown>): void;
  child(extra: Record<string, unknown>): Logger;
  timed<T>(event: string, fn: () => Promise<T>, fields?: Record<string, unknown>): Promise<T>;
}

function emit(payload: Record<string, unknown>) {
  // edge-runtime forwards stdout/stderr to Supabase analytics with a `level`
  // marker — use console.warn/error so warn/error levels are filterable.
  const line = JSON.stringify(payload);
  const lvl = payload.level;
  if (lvl === "error") console.error(line);
  else if (lvl === "warn") console.warn(line);
  else console.log(line);
}

function safeErr(err: unknown): Record<string, unknown> {
  if (!err) return {};
  if (err instanceof Error) {
    return { err_name: err.name, err_msg: err.message, err_stack: err.stack?.split("\n").slice(0, 6).join("\n") };
  }
  try { return { err_msg: String(err) }; } catch { return { err_msg: "unknown" }; }
}

function genReqId(): string {
  // Browser-safe random id; Deno also has crypto.randomUUID.
  try { return crypto.randomUUID().slice(0, 8); } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

export function createLogger(fn: string, req?: Request, base: Record<string, unknown> = {}): Logger {
  const reqId = req?.headers.get("x-request-id") || genReqId();
  const ctx: Record<string, unknown> = { fn, req_id: reqId, ...base };
  if (req) {
    try {
      const url = new URL(req.url);
      ctx.path = url.pathname;
      ctx.method = req.method;
    } catch { /* noop */ }
  }

  function build(level: LogLevel, event: string, fields?: Record<string, unknown>) {
    return { ts: new Date().toISOString(), level, event, ...ctx, ...(fields || {}) };
  }

  const self: Logger = {
    fn,
    reqId,
    log(level, event, fields) { emit(build(level, event, fields)); },
    debug(event, fields) { emit(build("debug", event, fields)); },
    info(event, fields) { emit(build("info", event, fields)); },
    warn(event, fields) { emit(build("warn", event, fields)); },
    error(event, err, fields) { emit(build("error", event, { ...safeErr(err), ...(fields || {}) })); },
    event(event, fields) { emit(build("info", event, fields)); },
    child(extra) { return createLogger(fn, undefined, { ...ctx, ...extra }); },
    async timed(event, fn, fields) {
      const t0 = performance.now();
      try {
        const out = await fn();
        emit(build("info", event, { ...(fields || {}), ms: Math.round(performance.now() - t0), ok: true }));
        return out;
      } catch (e) {
        emit(build("error", event, { ...(fields || {}), ms: Math.round(performance.now() - t0), ok: false, ...safeErr(e) }));
        throw e;
      }
    },
  };
  return self;
}
