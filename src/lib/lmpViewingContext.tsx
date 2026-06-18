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

/**
 * Discriminated union that describes the board's data scope.
 *
 *  - { kind: "self" }  — only LMPs where the effective user is a Prep or Support POC
 *  - { kind: "all" }   — all authorised records (admin/allocator in normal mode only)
 *  - { kind: "poc"; pocId: string; pocName: string }
 *                      — LMPs linked to a specific poc_profiles.id via active Prep/Support link
 */
export type LmpBoardScope =
  | { kind: "self" }
  | { kind: "all" }
  | { kind: "poc"; pocId: string; pocName: string };

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
  return normalized.split(/[/,&+]/).map(s => s.trim()).filter(Boolean);
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

/** Check if a user (by poc_profiles ID or name) is a POC on this record */
export function isUserPocOnRecord(rec: LmpRecord, userName: string, pocId?: string | null): boolean {
  if (!userName && !pocId) return false;
  // UUID-based check — authoritative when IDs are populated
  if (pocId) {
    if (rec.prepPocId && rec.prepPocId === pocId) return true;
    if (rec.supportPocId && rec.supportPocId === pocId) return true;
    if (Array.isArray(rec.outreachPocIds) && rec.outreachPocIds.includes(pocId)) return true;
  }
  // Name-based fallback — handles legacy records and sheet-sourced data
  if (userName) {
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
  }
  return false;
}

/**
 * Operational POC check — explicitly assigned Prep or Support only.
 * Outreach is display-only metadata and does not grant operational access.
 */
export function isUserOperationalPoc(rec: LmpRecord, userName: string, pocId?: string | null): boolean {
  if (pocId) {
    if (rec.prepPocId && rec.prepPocId === pocId) return true;
    if (rec.supportPocId && rec.supportPocId === pocId) return true;
  }
  if (userName) {
    if (rec.prepPoc?.name && checkCell(rec.prepPoc.name, userName)) return true;
    if (rec.supportPoc?.name && checkCell(rec.supportPoc.name, userName)) return true;
  }
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
  const { user, role, viewAsRole } = useRole();
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

  const [target, setTargetState] = useState<ViewingTarget>(defaultTarget);
  // UUID of the person currently being viewed (null = self or all)
  const [targetPocId, setTargetPocId] = useState<string | null>(null);

  // When the real user/role resolves, reset to the default target.
  // No localStorage restore — the board scope is session-only.
  useEffect(() => {
    setTargetState(defaultTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, role, ownName]);

  const setTarget = useCallback((t: ViewingTarget) => {
    setTargetState(t);
    if (t === "me" || t === "all") {
      setTargetPocId(null);
    }
  }, []);

  const { data: lmpRecords = [] } = useLmpRows();
  const { data: dbPocList } = usePocSwitcherList();

  // Use DB-based POC list (individual names) if available, else fallback to sheet parsing.
  // pocOptions.total comes directly from usePocSwitcherList (distinct lmp_id count per POC)
  // and must NOT be recalculated using isPocOnRecord, which includes allocator/adminOwner.
  const pocOptions: PocOption[] = useMemo(() => {
    if (dbPocList && dbPocList.length > 0) {
      return dbPocList.map((p, i) => ({
        name: p.name,
        initials: p.initials,
        color: POC_COLORS[i % POC_COLORS.length],
        total: p.total,  // distinct active lmp_poc_links count (no allocator inflation)
        primary: p.primary,
        secondary: p.secondary,
        outreach: p.outreach,
      }));
    }

    // Fallback: parse from sheet data, splitting combined names
    const map = new Map<string, PocOption>();
    for (const r of lmpRecords) {
      const allNames: string[] = [];
      if (r.prepPoc?.name) allNames.push(...splitPocNames(r.prepPoc.name));
      if (r.supportPoc?.name) allNames.push(...splitPocNames(r.supportPoc.name));

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

  // View-as controls filtering only. Authority always comes from the real role.
  const matchName = user.pocProfileName ?? user.name;
  const matchPocId = user.pocProfileId ?? null;

  const value = useMemo<Ctx>(() => {
    const filterFor = (rec: LmpRecord) => {
      if (target === "all") return true;
      // "My LMPs" and specific-person view both use operational-only check.
      // allocator and adminOwner text fields must not make an LMP visible here.
      if (target === "me") return isUserOperationalPoc(rec, matchName, matchPocId);
      // Specific POC selected: UUID check preferred, name-based fallback for legacy records
      return isUserOperationalPoc(rec, target, targetPocId);
    };

    const modeFor = (rec: LmpRecord): LmpInteractionMode =>
      isUserOperationalPoc(rec, matchName, matchPocId) ? "action" : "summary";

    return { target, setTarget, pocOptions, modeFor, filterFor, currentUserName: matchName };
  }, [target, targetPocId, pocOptions, matchName, matchPocId, setTarget]);

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
