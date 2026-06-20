// Google Sheets transport with retry, exponential backoff, and per-call timeouts.
// Uses Google Sheets API v4 directly (no Lovable gateway).
// Reads use GOOGLE_API_KEY; writes use service account JWT (GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY).

import { getGoogleAccessToken } from "./googleAuth.ts";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export type SheetsErrorKind =
  | "sheets_rate_limited"
  | "sheets_timeout"
  | "sheets_auth"
  | "sheets_server"
  | "sheets_client"
  | "sheets_network";

export class SheetsTransportError extends Error {
  kind: SheetsErrorKind;
  status?: number;
  retryable: boolean;
  constructor(kind: SheetsErrorKind, message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "SheetsTransportError";
    this.kind = kind;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}

export function isSheetsTransportError(err: unknown): err is SheetsTransportError {
  return err instanceof SheetsTransportError;
}

export function isRetryableSheetsError(err: unknown): boolean {
  if (err instanceof SheetsTransportError) return err.retryable;
  const msg = err instanceof Error ? err.message : String(err);
  return /\[(408|425|429|500|502|503|504)\]/.test(msg) || /rate.?limit|quota|exhaust|timeout|abort/i.test(msg);
}

function classify(status: number): SheetsErrorKind {
  if (status === 429) return "sheets_rate_limited";
  if (status === 401 || status === 403) return "sheets_auth";
  if (status >= 500) return "sheets_server";
  return "sheets_client";
}

function jitter(ms: number) {
  return ms + Math.floor(Math.random() * Math.min(250, ms / 2));
}

export interface SheetsClientOpts {
  spreadsheetId: string;
  /** Per-attempt timeout. Default 12_000 ms. */
  timeoutMs?: number;
  /** Max retries on retryable errors. Default 3. */
  maxRetries?: number;
  /** Base backoff in ms. Default 1000 ms. */
  baseBackoffMs?: number;
  // Legacy compat fields — ignored
  sheetsApiKey?: string;
}

export interface SheetsClient {
  baseUrl: string;
  headers: Record<string, string>;
  batchGet(ranges: string[], renderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE"): Promise<Record<string, string[][]>>;
  batchUpdate(data: { range: string; values: unknown[][] }[]): Promise<unknown>;
  rawFetch(url: string, init?: RequestInit): Promise<Response>;
}

export function createSheetsClient(opts: SheetsClientOpts): SheetsClient {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const maxRetries = opts.maxRetries ?? 3;
  const baseBackoff = opts.baseBackoffMs ?? 1000;
  const apiKey = Deno.env.get("GOOGLE_API_KEY") ?? "";

  let id = opts.spreadsheetId;
  const m = id.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) id = m[1];
  else id = id.split("/")[0].split("?")[0];

  const baseUrl = `${SHEETS_BASE}/${id}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  async function attempt(url: string, init: RequestInit, label: string): Promise<Response> {
    let lastErr: unknown = null;
    for (let n = 0; n <= maxRetries; n++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) return res;
        const body = await res.text().catch(() => "");
        if (RETRYABLE_STATUS.has(res.status) && n < maxRetries) {
          const wait = jitter(Math.min(baseBackoff * 2 ** n, 4000));
          console.warn(`Sheets ${label} ${res.status}, retry ${n + 1}/${maxRetries} in ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw new SheetsTransportError(
          classify(res.status),
          `${label} [${res.status}]: ${body.slice(0, 300)}`,
          { status: res.status, retryable: RETRYABLE_STATUS.has(res.status) },
        );
      } catch (err) {
        clearTimeout(t);
        if (err instanceof SheetsTransportError) throw err;
        const isAbort = err instanceof DOMException && err.name === "AbortError";
        lastErr = err;
        if (n < maxRetries) {
          const wait = jitter(Math.min(baseBackoff * 2 ** n, 4000));
          console.warn(`Sheets ${label} ${isAbort ? "timeout" : "network err"}, retry ${n + 1}/${maxRetries} in ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw new SheetsTransportError(
          isAbort ? "sheets_timeout" : "sheets_network",
          `${label} ${isAbort ? "timed out" : "network error"}: ${err instanceof Error ? err.message : String(err)}`,
          { retryable: true },
        );
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`${label}: max retries exceeded`);
  }

  return {
    baseUrl,
    headers,
    async batchGet(ranges, renderOption = "FORMATTED_VALUE") {
      const token = await getGoogleAccessToken([SHEETS_SCOPE]);
      const params = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
      const url = `${baseUrl}/values:batchGet?${params}&valueRenderOption=${renderOption}`;
      const res = await attempt(url, { headers: { ...headers, Authorization: `Bearer ${token}` } }, "batchGet");
      const data = await res.json();
      const out: Record<string, string[][]> = {};
      for (const vr of data.valueRanges || []) out[vr.range] = vr.values || [];
      return out;
    },
    async batchUpdate(data) {
      const token = await getGoogleAccessToken([SHEETS_SCOPE]);
      const res = await attempt(
        `${baseUrl}/values:batchUpdate`,
        {
          method: "POST",
          headers: { ...headers, Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            valueInputOption: "USER_ENTERED",
            data: data.map((d) => ({ ...d, majorDimension: "ROWS" })),
          }),
        },
        "batchUpdate",
      );
      return await res.json();
    },
    async rawFetch(url, init) {
      const token = await getGoogleAccessToken([SHEETS_SCOPE]);
      return attempt(url, { headers: { ...headers, Authorization: `Bearer ${token}` }, ...init }, "rawFetch");
    },
  };
}
