/**
 * Canonical Prep POC eligibility — operational POCs only (not outreach display tags).
 *
 * A profile is eligible when ALL hold:
 *   1. status = active
 *   2. role_type ≠ outreach_poc
 *   3. At least one of:
 *      - assigned prep domain (primary_domain or domain_tags)
 *      - any prep/support lmp_poc_links row (current or historical)
 */

export type PocProfileLike = {
  id: string;
  name?: string | null;
  status?: string | null;
  role_type?: string | null;
  primary_domain?: string | null;
  domain_tags?: string[] | null;
};

export function isOutreachOnlyPoc(roleType: string | null | undefined): boolean {
  const r = (roleType ?? "prep_poc").toLowerCase();
  return r === "outreach_poc" || r === "outreach";
}

/** Operational POCs participate in workload/capacity; outreach POCs do not. */
export function isOperationalPocRole(roleType: string | null | undefined): boolean {
  return !isOutreachOnlyPoc(roleType);
}

/** UI role badge — derived from role_type, not the stored label column. */
export function pocRoleTypeLabel(roleType: string | null | undefined): string {
  const r = (roleType ?? "prep_poc").toLowerCase();
  if (r === "outreach_poc" || r === "outreach") return "Outreach POC";
  if (r === "admin") return "Admin";
  if (r === "allocator") return "Allocator";
  if (r === "support_poc") return "Support POC";
  return "Prep POC";
}

/** Internal label persisted on poc_profiles — not used for UI identity. */
export function pocInternalLabel(roleType: string | null | undefined): string {
  return pocRoleTypeLabel(roleType);
}

export function pocDomainDisplayLabel(p: {
  primary_domain?: string | null;
  domain_tags?: string[] | null;
}): string {
  const primary = (p.primary_domain ?? "").trim();
  const tags = Array.isArray(p.domain_tags)
    ? p.domain_tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const d of primary ? [primary, ...tags] : tags) {
    const key = d.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parts.push(d);
  }
  return parts.length ? parts.join(", ") : "—";
}

export function pocHasAssignedDomains(p: PocProfileLike): boolean {
  const primary = (p.primary_domain ?? "").trim();
  const tags = Array.isArray(p.domain_tags)
    ? p.domain_tags.filter((t) => t && String(t).trim())
    : [];
  return !!primary || tags.length > 0;
}

export function isEligiblePrepPocProfile(
  p: PocProfileLike,
  prepSupportLinkPocIds: ReadonlySet<string>,
): boolean {
  if ((p.status ?? "active") !== "active") return false;
  if (isOutreachOnlyPoc(p.role_type)) return false;
  const hasDomain = pocHasAssignedDomains(p);
  const hasPrepSupportHistory = prepSupportLinkPocIds.has(p.id);
  return hasDomain || hasPrepSupportHistory;
}

/** Outreach names for display-only tagging — not operational POC users. */
export function isOutreachDisplayProfile(p: { role_type?: string | null }): boolean {
  return isOutreachOnlyPoc(p.role_type);
}
