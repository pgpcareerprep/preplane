import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type LmpRecord } from "./lmpTypes";
import { useRole } from "./rolesContext";
import { useLmpRows } from "./sheets/hooks";
import { usePocSwitcherList } from "./hooks/useDbData";

/**
 * Viewing context for the LMP board.
 *
 * Admin/Senior users can switch which POC's records they view:
 *  - "me"   → only their own LMPs (Action Mode)
 *  - "all"  → every LMP across POCs (Summary Mode)
 *  - <name> → a specific other POC's LMPs (Summary Mode)
 */

export type ViewingTarget = "me" | "all" | string;
export type LmpInteractionMode = "action" | "summary";

type PocOption = {
  name: string;
  initials: string;
  color: string;
  total: number;
  primary: number;
  secondary: number;
  outreach: number;
};

type Ctx = {
  target: ViewingTarget;
  setTarget: (t: ViewingTarget) => void;
  pocOptions: PocOption[];
  modeFor: (rec: LmpRecord) => LmpInteractionMode;
  filterFor: (rec: LmpRecord) => boolean;
  currentUserName: string;
};

const ViewingContext = createContext<Ctx | null>(null);

/** Split a combined POC name cell into individual names */
function splitPocNames(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  const normalized = raw.replace(/\s+and\s+/gi, "/");
  return normalized.split(/[\/,&+]/).map(s => s.trim()).filter(Boolean);
}

export function ownerOf(rec: LmpRecord): string {
  return rec.prepPoc?.name ?? rec.domainPrepPoc?.name ?? rec.pocs[0]?.name ?? "";
}

/**
 * Fuzzy name matcher: handles first-name-only sheet values matching full-name
 * DB/auth users.  e.g. sheet "Alex" matches DB "Alex Johnson".
 */
function namesMatch(sheetName: string, targetFullName: string): boolean {
  const a = sheetName.toLowerCase().trim();
  const b = targetFullName.toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const aFirst = a.split(/\s+/)[0];
  const bFirst = b.split(/\s+/)[0];
  // Target full name starts with sheet first name
  if (aFirst.length >= 3 && b.startsWith(aFirst)) return true;
  // Sheet name starts with target first name
  if (bFirst.length >= 3 && a.startsWith(bFirst)) return true;
  // First names match
  if (aFirst.length >= 3 && aFirst === bFirst) return true;
  return false;
}

/** Check cell value (possibly combined) against a target name using fuzzy match */
function checkCell(raw: string, targetName: string): boolean {
  if (!raw) return false;
  return splitPocNames(raw).some(n => namesMatch(n, targetName));
}

/** Check if a user (by name) is a POC on this record — handles split names & first-name matching */
export function isUserPocOnRecord(rec: LmpRecord, userName: string): boolean {
  if (!userName) return false;
  if (rec.prepPoc?.name && checkCell(rec.prepPoc.name, userName)) return true;
  if (rec.supportPoc?.name && checkCell(rec.supportPoc.name, userName)) return true;
  if (rec.outreachPoc?.name && checkCell(rec.outreachPoc.name, userName)) return true;
  // deprecated compat
  if (rec.domainPrepPoc?.name && checkCell(rec.domainPrepPoc.name, userName)) return true;
  if (rec.behavioralPrepPoc?.name && checkCell(rec.behavioralPrepPoc.name, userName)) return true;
  for (const p of rec.pocs || []) {
    if (checkCell(p.name, userName)) return true;
  }
  if (rec.allocator && checkCell(rec.allocator, userName)) return true;
  if (rec.adminOwner && checkCell(rec.adminOwner, userName)) return true;
  return false;
}

/**
 * Operational POC check — only Primary POC (prepPoc) and Support POC (supportPoc).
 * Excludes allocator, adminOwner, and outreachPoc — those roles have read-only
 * access to operational actions like editing progress, scheduling sessions, etc.
 */
export function isUserOperationalPoc(rec: LmpRecord, userName: string): boolean {
  if (!userName) return false;
  if (rec.prepPoc?.name && checkCell(rec.prepPoc.name, userName)) return true;
  if (rec.supportPoc?.name && checkCell(rec.supportPoc.name, userName)) return true;
  // deprecated compat fields
  if (rec.domainPrepPoc?.name && checkCell(rec.domainPrepPoc.name, userName)) return true;
  if (rec.behavioralPrepPoc?.name && checkCell(rec.behavioralPrepPoc.name, userName)) return true;
  return false;
}

/** Check if a specific POC name appears on this record in any role */
function isPocOnRecord(rec: LmpRecord, pocName: string): boolean {
  if (!pocName) return false;
  if (rec.prepPoc?.name && checkCell(rec.prepPoc.name, pocName)) return true;
  if (rec.supportPoc?.name && checkCell(rec.supportPoc.name, pocName)) return true;
  if (rec.outreachPoc?.name && checkCell(rec.outreachPoc.name, pocName)) return true;
  // deprecated compat
  if (rec.domainPrepPoc?.name && checkCell(rec.domainPrepPoc.name, pocName)) return true;
  if (rec.behavioralPrepPoc?.name && checkCell(rec.behavioralPrepPoc.name, pocName)) return true;
  for (const p of rec.pocs || []) {
    if (checkCell(p.name, pocName)) return true;
  }
  if (rec.allocator && checkCell(rec.allocator, pocName)) return true;
  if (rec.adminOwner && checkCell(rec.adminOwner, pocName)) return true;
  return false;
}

const POC_COLORS = [
  "bg-orange-200 text-orange-600",
  "bg-teal-200 text-teal-600",
  "bg-purple-200 text-purple-600",
  "bg-blue-200 text-blue-600",
  "bg-pink-200 text-pink-600",
  "bg-green-200 text-green-600",
  "bg-amber-200 text-amber-600",
  "bg-cyan-200 text-cyan-600",
];

export function LmpViewingProvider({ children }: { children: ReactNode }) {
  const { user, role, viewAsRole, viewAsUser, setViewAsUser } = useRole();
  const isViewingAsOther = role === "admin" && (viewAsRole !== role || !!viewAsUser);

  // Default target:
  //  - admin → "all" (org oversight)
  //  - allocator/poc with a resolved POC profile → their own name (so the
  //    "Viewing as" pill shows their name on first login)
  //  - otherwise → "me"
  const ownName = user.pocProfileName || (user.name && user.name !== "User" ? user.name : "");
  const defaultTarget: ViewingTarget =
    role === "admin"
      ? "all"
      : (ownName ? ownName : "me");

  // Persist switcher choice per-user across reloads
  const storageKey = user.id ? `lmp_viewing_target_${user.id}` : "";
  const readStored = (): ViewingTarget | null => {
    if (!storageKey || typeof window === "undefined") return null;
    try { return (window.localStorage.getItem(storageKey) as ViewingTarget) || null; } catch { return null; }
  };

  const [target, setTargetState] = useState<ViewingTarget>(defaultTarget);

  // When user/role resolves, hydrate from localStorage or fall back to default
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setTargetState(stored);
    } else {
      setTargetState(defaultTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, role, ownName]);

  // Sync: when Topbar viewAsUser changes (admin impersonation), update local target
  useEffect(() => {
    if (viewAsUser) setTargetState(viewAsUser.name);
  }, [viewAsUser]);

  const setTarget = useCallback((t: ViewingTarget) => {
    setTargetState(t);
    if (storageKey && typeof window !== "undefined") {
      try { window.localStorage.setItem(storageKey, t); } catch { /* ignore */ }
    }
    if (t === "me" || t === "all") {
      setViewAsUser(null);
    }
  }, [setViewAsUser, storageKey]);
  const { data: lmpRecords = [] } = useLmpRows();
  const { data: dbPocList } = usePocSwitcherList();

  // Use DB-based POC list (individual names) if available, else fallback to sheet parsing
  const pocOptions: PocOption[] = useMemo(() => {
    if (dbPocList && dbPocList.length > 0) {
      return dbPocList.map((p, i) => ({
        name: p.name,
        initials: p.initials,
        color: POC_COLORS[i % POC_COLORS.length],
        total: lmpRecords.filter(r => isPocOnRecord(r, p.name)).length,
        primary: p.primary,
        secondary: p.secondary,
        outreach: p.outreach,
      }));
    }

    // Fallback: parse from sheet data, splitting combined names
    const map = new Map<string, PocOption>();
    for (const r of lmpRecords) {
      // Extract all POC names from record and split combined cells
      const allNames: string[] = [];
      if (r.prepPoc?.name) allNames.push(...splitPocNames(r.prepPoc.name));
      if (r.supportPoc?.name) allNames.push(...splitPocNames(r.supportPoc.name));
      if (r.outreachPoc?.name) allNames.push(...splitPocNames(r.outreachPoc.name));

      for (const name of allNames) {
        if (!name) continue;
        const cur = map.get(name);
        if (cur) {
          cur.total += 1;
        } else {
          const initials = name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
          map.set(name, {
            name,
            initials,
            color: POC_COLORS[map.size % POC_COLORS.length],
            total: 1,
            primary: 0,
            secondary: 0,
            outreach: 0,
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [lmpRecords, dbPocList]);

  // Edit permission is always tied to the REAL logged-in user, never the
  // impersonated user. View-as is presentation-only; admin role grants no
  // edit shortcut. Filtering (what records appear) is independent.
  const matchName = user.pocProfileName ?? user.name;

  const value = useMemo<Ctx>(() => {
    const filterFor = (rec: LmpRecord) => {
      if (target === "all") return true;
      // "My LMPs" — filter to only records where the user is a POC
      if (target === "me") return isUserPocOnRecord(rec, matchName);
      // Specific POC name selected
      return isPocOnRecord(rec, target);
    };

    // Edit access is strictly for assigned Primary/Support POC only.
    // Admin, allocator, outreach POC, and other users get read-only summary mode.
    const modeFor = (rec: LmpRecord): LmpInteractionMode =>
      isUserOperationalPoc(rec, matchName) ? "action" : "summary";

    return { target, setTarget, pocOptions, modeFor, filterFor, currentUserName: matchName };
  }, [target, pocOptions, matchName, setTarget]);

  return <ViewingContext.Provider value={value}>{children}</ViewingContext.Provider>;
}

const FALLBACK_CTX: Ctx = {
  target: "me",
  setTarget: () => {},
  pocOptions: [],
  modeFor: () => "summary",
  filterFor: () => true,
  currentUserName: "",
};

export function useLmpViewing(): Ctx {
  const ctx = useContext(ViewingContext);
  return ctx ?? FALLBACK_CTX;
}

export function useLmpMode(rec: LmpRecord): LmpInteractionMode {
  return useLmpViewing().modeFor(rec);
}
