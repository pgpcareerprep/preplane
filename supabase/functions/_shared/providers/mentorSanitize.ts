export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^[+()\d][\d\s().-]{6,18}\d$/;

export function normToken(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function tokensOf(s: string): string[] {
  return normToken(s).split(" ").filter((t) => t.length > 2);
}

export function fuzzyContains(hay: string, needle: string): boolean {
  const h = normToken(hay);
  const n = normToken(needle);
  if (!h || !n) return false;
  if (h.includes(n)) return true;
  const ht = new Set(h.split(" "));
  return n.split(" ").every((w) => ht.has(w));
}

export function sanitizeEmail(v: unknown, hay: string): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!EMAIL_RE.test(s)) return null;
  if (!hay.toLowerCase().includes(s.toLowerCase())) return null;
  return s;
}

export function sanitizePhone(v: unknown, hay: string): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!PHONE_RE.test(s)) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  const lowHay = hay.toLowerCase();
  if (!lowHay.includes(s.toLowerCase()) && !lowHay.replace(/\D/g, "").includes(digits)) return null;
  return s;
}

export function sanitizePricing(v: unknown, hay: string): { amount: number; currency: string; unit: string } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const amount = typeof o.amount === "number" ? o.amount : Number(o.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currency = (typeof o.currency === "string" && o.currency.trim()) || "INR";
  const unit = (typeof o.unit === "string" && o.unit.trim()) || "session";
  const a = String(Math.round(amount));
  const lowHay = hay.toLowerCase().replace(/[,\s]/g, "");
  if (!lowHay.includes(a)) return null;
  return { amount, currency, unit };
}

export function sanitizeYears(v: unknown, hay: string): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 60) return null;
  const a = String(Math.round(n));
  if (!new RegExp(`\\b${a}\\s*(\\+)?\\s*(years|yrs|y)\\b`, "i").test(hay)) return null;
  return n;
}

export function cleanLinkedin(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[?#].*$/, "").replace(/\/+$/, "");
  while (true) {
    const next = s
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/^[a-z]{2,3}\.linkedin\.com\/in\//i, "")
      .replace(/^linkedin\.com\/in\//i, "");
    if (next === s) break;
    s = next;
  }
  if (!s) return null;
  return `https://www.linkedin.com/in/${s}`;
}

export function platformFromUrl(url: string): import("./types.ts").Platform | null {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com/in/")) return "LinkedIn";
  if (u.includes("topmate.io/")) return "Topmate";
  if (u.includes("adplist.org/")) return "ADPList";
  if (u.includes("superpeer.com/")) return "Superpeer";
  return null;
}

/** Fuzzy name match: "Priya S." vs "Priya Sharma". */
export function namesMatch(a: string, b: string): boolean {
  const ta = normToken(a).split(" ").filter(Boolean);
  const tb = normToken(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return false;
  if (normToken(a) === normToken(b)) return true;
  const firstA = ta[0];
  const firstB = tb[0];
  if (firstA !== firstB) return false;
  const lastA = ta[ta.length - 1];
  const lastB = tb[tb.length - 1];
  if (lastA.length === 1 || lastB.length === 1) return true;
  return lastA === lastB || lastA.startsWith(lastB[0]!) || lastB.startsWith(lastA[0]!);
}

export function dedupeKey(m: { linkedin?: string | null; email?: string | null; name: string; company: string }): string {
  if (m.linkedin) return m.linkedin.toLowerCase();
  if (m.email) return m.email.toLowerCase();
  return `${normToken(m.name)}|${normToken(m.company)}`;
}
