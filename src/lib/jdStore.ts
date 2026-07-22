// Per-process JD data persisted to localStorage + database
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type JdData = {
  lmpId: string;
  fileName: string;
  rawText: string;
  skills: string[];
  seniority: string;
  role: string;
  company: string;
  uploadedAt: string;
  source: "paste" | "file" | "link";
  link?: string;
};

const KEY_PREFIX = "jd_v1_";
const snapshotCache = new Map<string, { raw: string | null; data: JdData | null }>();

export function getJd(lmpId: string): JdData | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + lmpId);
    const cached = snapshotCache.get(lmpId);
    if (cached && cached.raw === raw) return cached.data;

    const data = raw ? (JSON.parse(raw) as JdData) : null;
    snapshotCache.set(lmpId, { raw, data });
    return data;
  } catch {
    snapshotCache.set(lmpId, { raw: null, data: null });
    return null;
  }
}

export function saveJd(data: JdData): void {
  const raw = JSON.stringify(data);
  localStorage.setItem(KEY_PREFIX + data.lmpId, raw);
  snapshotCache.set(data.lmpId, { raw, data });
  emitJdChange(data.lmpId);
}

/**
 * Merge partial JD fields into an existing JD entry (used when AI parse
 * completes in the background after the user already closed the modal).
 * No-op if no JD exists for this lmpId.
 */
export function mergeJd(lmpId: string, patch: Partial<JdData>): JdData | null {
  const existing = getJd(lmpId);
  if (!existing) return null;
  const merged: JdData = { ...existing, ...patch, lmpId };
  saveJd(merged);
  return merged;
}

export function deleteJd(lmpId: string): void {
  localStorage.removeItem(KEY_PREFIX + lmpId);
  snapshotCache.set(lmpId, { raw: null, data: null });
  emitJdChange(lmpId);
}

// ─── Reactive pub-sub so every useJd() consumer re-renders when JD changes,
// regardless of which component triggered the save. ──────────────────────
type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

function subscribeJd(lmpId: string, fn: Listener): () => void {
  let set = listeners.get(lmpId);
  if (!set) {
    set = new Set();
    listeners.set(lmpId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(lmpId);
  };
}

function emitJdChange(lmpId: string): void {
  listeners.get(lmpId)?.forEach((fn) => {
    try { fn(); } catch { /* noop */ }
  });
}

// Cross-tab sync (same browser, other tabs writing to localStorage)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(KEY_PREFIX)) return;
    emitJdChange(e.key.slice(KEY_PREFIX.length));
  });
}


/**
 * Attempt to fetch JD content from the database (lmp_processes.jd_text / jd_url).
 * Returns null silently if table/columns don't exist or no JD content is present.
 * `getJd` remains synchronous (localStorage); call this for DB fallback.
 */
export async function fetchJdFromDb(lmpId: string): Promise<JdData | null> {
  try {
    const { data, error } = await supabase
      .from("lmp_processes")
      .select("*")
      .eq("id", lmpId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, any>;
    const jdText: string | undefined = typeof row.jd_text === "string" ? row.jd_text : undefined;
    const jdUrl: string | undefined = typeof row.jd_url === "string" ? row.jd_url : undefined;
    const jdLabel: string | undefined = typeof row.jd_label === "string" ? row.jd_label : undefined;
    const jdFileName: string | undefined = typeof row.jd_file_name === "string" ? row.jd_file_name : undefined;
    const jdSource: string | undefined = typeof row.jd_source === "string" ? row.jd_source : undefined;
    const jdSeniority: string | undefined = typeof row.jd_seniority === "string" ? row.jd_seniority : undefined;
    const jdSkills: string[] = Array.isArray(row.jd_skills) ? row.jd_skills.filter((s: any) => typeof s === "string") : [];
    const jdUploadedAt: string | undefined = typeof row.jd_uploaded_at === "string" ? row.jd_uploaded_at : undefined;
    if (!jdText && !jdUrl) return null;
    const text = jdText || "";
    const role = typeof row.role === "string" ? row.role : "";
    const company = typeof row.company === "string" ? row.company : "";
    const source: JdData["source"] =
      jdSource === "paste" || jdSource === "file" || jdSource === "link"
        ? jdSource
        : jdUrl ? "link" : "paste";
    const data2: JdData = {
      lmpId,
      fileName: jdFileName || jdLabel || (jdUrl ? jdUrl.split("/").pop() || "JD link" : "JD from database"),
      rawText: text,
      skills: jdSkills.length ? jdSkills : extractSkillsFromText(text),
      seniority: jdSeniority || extractSeniority(text || role),
      role,
      company,
      uploadedAt: jdUploadedAt || new Date().toISOString(),
      source,
      ...(jdUrl ? { link: jdUrl } : {}),
    };
    // Cache locally so subsequent renders are instant.
    try { saveJd(data2); } catch { /* cache write failure is non-fatal */ }
    return data2;
  } catch {
    return null;
  }
}

/** Common skill keywords to scan for in JD text. */
export const SKILL_KEYWORDS = [
  "python", "sql", "excel", "powerpoint", "tableau", "power bi",
  "product management", "product strategy", "roadmap", "agile", "scrum",
  "growth", "analytics", "marketing", "branding", "seo", "sem", "performance marketing",
  "b2b", "b2c", "saas", "fintech", "edtech", "healthtech", "ecommerce",
  "go-to-market", "gtm", "customer success", "account management",
  "data analysis", "market research", "ux", "ui", "figma",
  "java", "javascript", "typescript", "react", "node.js", "aws", "gcp", "azure",
  "machine learning", "deep learning", "nlp", "computer vision",
  "finance", "accounting", "fundraising", "venture capital", "private equity",
  "operations", "supply chain", "logistics", "procurement",
  "sales", "bd", "business development", "partnerships",
  "communication", "leadership", "strategy", "consulting",
];

/** Parse skills from raw JD text using word-boundary matching. */
export function extractSkillsFromText(text: string): string[] {
  return SKILL_KEYWORDS.filter((skill) => {
    const escaped = skill.replace(/[.+/#-]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return re.test(text);
  });
}

/** Extract seniority hint from JD text or role string. Word-boundary safe. */
export function extractSeniority(text: string): string {
  const has = (w: string) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(text);
  if (has("vp") || /vice\s+president/i.test(text)) return "VP";
  if (has("director")) return "Director";
  if (has("intern") || has("internship")) return "Intern";
  if (has("senior") || has("sr") || has("lead") || has("principal") || has("staff")) return "Senior";
  if (has("junior") || has("jr") || has("entry") || has("associate") || has("trainee")) return "Junior";
  if (has("manager") || has("mid-level") || has("mid")) return "Mid";
  return "Mid";
}

/** Persist a JD to the database so it survives refreshes for all users. */
export async function saveJdToDb(data: JdData, uploadedBy?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: updated, error } = await supabase
      .from("lmp_processes")
      .update({
        jd_text: data.rawText || null,
        jd_url: data.link || null,
        jd_label: data.fileName || null,
        jd_skills: data.skills || [],
        jd_seniority: data.seniority || null,
        jd_file_name: data.fileName || null,
        jd_source: data.source,
        jd_uploaded_at: data.uploadedAt,
        jd_uploaded_by: uploadedBy || null,
      } as any)
      .eq("id", data.lmpId)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!updated || updated.length === 0) {
      return {
        ok: false,
        error:
          "PERMISSION_DENIED_OR_ROW_MISSING: You are not linked as an " +
          "operational POC for this LMP. Ask an admin to verify your POC " +
          "mapping and LMP assignment.",
      };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "unknown" };
  }
}

/** Clear JD on the database row. */
export async function clearJdInDb(lmpId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("lmp_processes")
      .update({
        jd_text: null,
        jd_url: null,
        jd_label: null,
        jd_skills: [],
        jd_seniority: null,
        jd_file_name: null,
        jd_source: null,
        jd_uploaded_at: null,
        jd_uploaded_by: null,
      } as any)
      .eq("id", lmpId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        "PERMISSION_DENIED_OR_ROW_MISSING: You are not linked as an " +
        "operational POC for this LMP. Ask an admin to verify your POC " +
        "mapping and LMP assignment."
      );
    }
  } catch (e) {
    console.warn("[clearJdInDb] failed:", e);
  }
}

/** React hook: returns local JD instantly + hydrates from DB on mount.
 *  Reactive across the whole app — any saveJd/deleteJd anywhere re-renders
 *  every consumer of useJd(lmpId). */
export function useJd(lmpId: string): [JdData | null, (data: JdData | null) => void] {
  const jd = useSyncExternalStore(
    (cb) => subscribeJd(lmpId, cb),
    () => getJd(lmpId),
    () => null,
  );
  useEffect(() => {
    let cancelled = false;
    if (!getJd(lmpId)) {
      void fetchJdFromDb(lmpId).then((data) => {
        // fetchJdFromDb already calls saveJd → listeners fire automatically.
        if (cancelled || !data) return;
      });
    }
    return () => { cancelled = true; };
  }, [lmpId]);
  const update = useCallback((data: JdData | null) => {
    if (data) saveJd(data); else deleteJd(lmpId);
  }, [lmpId]);
  return [jd, update];
}

