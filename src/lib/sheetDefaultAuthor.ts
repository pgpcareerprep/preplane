import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SheetDefaultAuthor = {
  name: string;
  email: string | null;
  initials: string;
  color: string;
};

const FALLBACK: SheetDefaultAuthor = {
  name: "Sheet",
  email: null,
  initials: "SH",
  color: "bg-n200 text-n700",
};

const SETTINGS_KEY = "sheet_default_author";
const CACHE_KEY = "lmp_sheet_default_author_v1";

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "").join("") || name.slice(0, 2).toUpperCase();
}

function normalize(raw: unknown): SheetDefaultAuthor | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<SheetDefaultAuthor>;
  if (!r.name) return null;
  return {
    name: r.name,
    email: r.email ?? null,
    initials: r.initials || initialsOf(r.name),
    color: r.color || "bg-emerald-100 text-emerald-700",
  };
}

async function fetchFromDb(): Promise<SheetDefaultAuthor> {
  // 1. explicit setting
  const { data: settingRow } = await supabase
    .from("system_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  const fromSetting = normalize(settingRow?.value);
  if (fromSetting) return fromSetting;

  // 2. first admin / allocator profile by access_level
  const { data: adminRows } = await supabase
    .from("poc_profiles")
    .select("name, email, access_level, color")
    .in("access_level", ["admin", "allocator"])
    .order("name", { ascending: true })
    .limit(1);
  const a = adminRows?.[0];
  if (a?.name) {
    return {
      name: a.name,
      email: a.email ?? null,
      initials: initialsOf(a.name),
      color: a.color || "bg-emerald-100 text-emerald-700",
    };
  }
  return FALLBACK;
}

export function getSheetDefaultAuthor(): SheetDefaultAuthor {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return FALLBACK;
    return normalize(JSON.parse(raw)) ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function useSheetDefaultAuthor(): SheetDefaultAuthor {
  const [v, setV] = useState<SheetDefaultAuthor>(() => getSheetDefaultAuthor());
  useEffect(() => {
    let mounted = true;
    fetchFromDb()
      .then((next) => {
        if (!mounted) return;
        setV(next);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      })
      .catch(() => { /* keep fallback */ });
    return () => { mounted = false; };
  }, []);
  return v;
}
