import { LxFilterRow } from "./primitives";
import {
  DOMAIN_OPTIONS, RANGE_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS, type LmpFilters,
} from "@/components/dashboards/filters/useLmpFilters";
import type { ReactNode } from "react";

export function LxLmpFilters({
  filters, set, pocOptions, showPrepPoc, showOutreachPoc: _showOutreachPoc, right,
}: {
  filters: LmpFilters;
  set: <K extends keyof LmpFilters>(k: K, v: LmpFilters[K]) => void;
  pocOptions: string[];
  showPrepPoc?: boolean;
  /** @deprecated Outreach POC filter has been removed. */
  showOutreachPoc?: boolean;
  right?: ReactNode;
}) {
  const items: { label: string; value: string; options: string[]; onChange: (v: string) => void }[] = [
    { label: "Range",  value: filters.range,  options: RANGE_OPTIONS as unknown as string[],
      onChange: (v: string) => set("range",  v as LmpFilters["range"]) },
    { label: "Domain", value: filters.domain, options: DOMAIN_OPTIONS as unknown as string[],
      onChange: (v: string) => set("domain", v as LmpFilters["domain"]) },
    { label: "Status", value: filters.status, options: STATUS_OPTIONS as unknown as string[],
      onChange: (v: string) => set("status", v as LmpFilters["status"]) },
    { label: "Type",   value: filters.type,   options: TYPE_OPTIONS as unknown as string[],
      onChange: (v: string) => set("type",   v as LmpFilters["type"]) },
  ];
  if (showPrepPoc) items.push({
    label: "Prep POC", value: filters.prepPoc, options: pocOptions,
    onChange: (v: string) => set("prepPoc", v),
  });
  return <LxFilterRow filters={items} right={right} />;
}