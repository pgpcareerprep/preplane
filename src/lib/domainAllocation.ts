import {
  type Domain,
  type Process,
  isConverted,
  calculateOutcomeConversionRate,
  isConvertedLmpStatus,
  isOtherReasonsLmpStatus,
} from "@/lib/lmpProcessQueries";
import type { LmpRecord } from "@/lib/lmpTypes";

/**
 * POC → primary domain map, built at call time from live `poc_profiles`
 * (see `usePocPrimaryDomainMap` for the React-Query hook).
 *
 * The previous module-level `POC_PRIMARY_DOMAIN` constant was sourced from
 * the now-empty mock `POCS` / `DOMAINS` arrays and silently classified every
 * LMP as in-domain. All helpers now take an explicit map so callers must
 * provide live data.
 */
export type PocPrimaryDomainMap = Record<string, string>;

export function pocPrimaryDomain(
  name: string,
  map: PocPrimaryDomainMap,
): string | undefined {
  return map[name];
}

/** Tag an LMP as cross-domain if its prep POC's primary domain ≠ LMP domain. */
export function isCrossDomain(r: Process, map: PocPrimaryDomainMap): boolean {
  const pd = map[r.prepPoc];
  return !!pd && pd.toLowerCase() !== (r.domain ?? "").toLowerCase();
}

export type DomainAllocation = {
  domain: Domain;
  total: number;
  inDomain: number;
  cross: number;
  inDomainConvPct: number;
  crossConvPct: number;
};

export function domainAllocation(
  rows: Process[],
  map: PocPrimaryDomainMap,
  records?: LmpRecord[],
): DomainAllocation[] {
  const statusMap = records ? new Map(records.map((r) => [r.id, r.status])) : null;
  const domains = Array.from(new Set(rows.map((r) => r.domain).filter(Boolean))) as Domain[];
  return domains.map((d) => {
    const list = rows.filter((r) => r.domain === d);
    const inD = list.filter((r) => !isCrossDomain(r, map));
    const crD = list.filter((r) => isCrossDomain(r, map));
    const pct = (arr: Process[]) => {
      if (statusMap) {
        let converted = 0;
        let otherReasons = 0;
        for (const p of arr) {
          const status = statusMap.get(p.processId);
          if (isConvertedLmpStatus(status)) converted += 1;
          if (isOtherReasonsLmpStatus(status)) otherReasons += 1;
        }
        return calculateOutcomeConversionRate(converted, arr.length, otherReasons);
      }
      return arr.length ? (arr.filter(isConverted).length / arr.length) * 100 : 0;
    };
    return {
      domain: d,
      total: list.length,
      inDomain: inD.length,
      cross: crD.length,
      inDomainConvPct: +pct(inD).toFixed(1),
      crossConvPct: +pct(crD).toFixed(1),
    };
  });
}

export type PocPurityRow = {
  poc: string;
  primaryDomain: Domain;
  inDomainCount: number;
  crossCount: number;
  inDomainConvPct: number;
  crossConvPct: number;
};

export function pocPurityMatrix(
  rows: Process[],
  map: PocPrimaryDomainMap,
  records?: LmpRecord[],
): PocPurityRow[] {
  const statusMap = records ? new Map(records.map((r) => [r.id, r.status])) : null;
  const names = new Set<string>();
  rows.forEach((r) => { if (r.prepPoc) names.add(r.prepPoc); });
  const result: PocPurityRow[] = [];
  names.forEach((name) => {
    const primary = map[name];
    if (!primary) return;
    const owned = rows.filter((r) => r.prepPoc === name);
    const inD = owned.filter((r) => r.domain === primary);
    const crD = owned.filter((r) => r.domain !== primary);
    const conv = (arr: Process[]) => {
      if (statusMap) {
        let converted = 0;
        let otherReasons = 0;
        for (const p of arr) {
          const status = statusMap.get(p.processId);
          if (isConvertedLmpStatus(status)) converted += 1;
          if (isOtherReasonsLmpStatus(status)) otherReasons += 1;
        }
        return +calculateOutcomeConversionRate(converted, arr.length, otherReasons).toFixed(0);
      }
      return arr.length ? +((arr.filter(isConverted).length / arr.length) * 100).toFixed(0) : 0;
    };
    result.push({
      poc: name,
      primaryDomain: primary as Domain,
      inDomainCount: inD.length,
      crossCount: crD.length,
      inDomainConvPct: conv(inD),
      crossConvPct: conv(crD),
    });
  });
  return result.sort((a, b) => b.inDomainCount + b.crossCount - (a.inDomainCount + a.crossCount));
}

export function allocationKpis(rows: Process[], map: PocPrimaryDomainMap, records?: LmpRecord[]) {
  const statusMap = records ? new Map(records.map((r) => [r.id, r.status])) : null;
  const total = rows.length;
  const cross = rows.filter((r) => isCrossDomain(r, map)).length;
  const crossPct = total ? (cross / total) * 100 : 0;
  const inD = rows.filter((r) => !isCrossDomain(r, map));
  const crD = rows.filter((r) => isCrossDomain(r, map));
  const conv = (arr: Process[]) => {
    if (statusMap) {
      let converted = 0;
      let otherReasons = 0;
      for (const p of arr) {
        const status = statusMap.get(p.processId);
        if (isConvertedLmpStatus(status)) converted += 1;
        if (isOtherReasonsLmpStatus(status)) otherReasons += 1;
      }
      return calculateOutcomeConversionRate(converted, arr.length, otherReasons);
    }
    return arr.length ? (arr.filter(isConverted).length / arr.length) * 100 : 0;
  };
  const inDomainConv = conv(inD);
  const crossConv = conv(crD);
  const gap = inDomainConv - crossConv;

  const alloc = domainAllocation(rows, map, records);
  const mostMis = [...alloc]
    .filter((d) => d.total > 0)
    .sort((a, b) => (b.cross / Math.max(1, b.total)) - (a.cross / Math.max(1, a.total)))[0];

  const purity = pocPurityMatrix(rows, map, records);
  const bestCross = [...purity]
    .filter((p) => p.crossCount >= 2)
    .sort((a, b) => b.crossConvPct - a.crossConvPct)[0];

  return {
    total, cross, crossPct,
    inDomainConv, crossConv, gap,
    mostMisallocatedDomain: mostMis ? mostMis.domain : "—",
    mostMisallocatedPct: mostMis ? (mostMis.cross / Math.max(1, mostMis.total)) * 100 : 0,
    bestCrossPoc: bestCross ? `${bestCross.poc} · ${bestCross.crossConvPct}%` : "—",
  };
}
