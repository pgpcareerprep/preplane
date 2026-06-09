export type LmpSheetRowLookup = {
  rowIndex: number;
  ambiguousCompanyRoleMatches: number;
};

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Locate an LMP Tracker row without allowing a newly generated LMP ID to
 * inherit an older row that happens to share company/role.
 */
export function findLmpSheetRow(
  headers: unknown[],
  rows: unknown[][],
  identity: { lmpCode?: string | null; company: string; role: string },
): LmpSheetRowLookup {
  const lmpCode = normalized(identity.lmpCode);
  const lmpIdCol = headers.indexOf("LMP ID");

  if (lmpCode) {
    if (lmpIdCol !== -1) {
      for (let i = 1; i < rows.length; i++) {
        if (normalized(rows[i]?.[lmpIdCol]) === lmpCode) {
          return { rowIndex: i, ambiguousCompanyRoleMatches: 0 };
        }
      }
    }
    return { rowIndex: -1, ambiguousCompanyRoleMatches: 0 };
  }

  const companyCol = headers.indexOf("Company");
  const roleCol = headers.indexOf("Role");
  if (companyCol === -1 || roleCol === -1) {
    return { rowIndex: -1, ambiguousCompanyRoleMatches: 0 };
  }

  const company = normalized(identity.company);
  const role = normalized(identity.role);
  const matches: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (
      normalized(rows[i]?.[companyCol]) === company &&
      normalized(rows[i]?.[roleCol]) === role
    ) {
      matches.push(i);
    }
  }

  return {
    rowIndex: matches.length === 1 ? matches[0] : -1,
    ambiguousCompanyRoleMatches: matches.length > 1 ? matches.length : 0,
  };
}
