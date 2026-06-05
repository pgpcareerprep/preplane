/**
 * Domain options are now driven by the `domains` table (see
 * `useDomainOptions` and `resolveDomainName`). This file only retains
 * access-level constants used across the POC management UI.
 */


export type PocAccessLevel = "admin" | "allocator" | "poc";

export const ACCESS_LABEL: Record<PocAccessLevel, string> = {
  admin: "Admin",
  allocator: "Allocator",
  poc: "POC",
};

export const ACCESS_PILL: Record<PocAccessLevel, string> = {
  admin: "bg-primary/10 text-primary border-primary/30",
  allocator: "bg-teal-50 text-teal-700 border-teal-200",
  poc: "bg-n100 text-n700 border-n200",
};
