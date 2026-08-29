/**
 * HR/business classification of a profile: Tipo and Empresa.
 *
 * Deliberately separate from the DISC classification in `@/server/pdf/disc`.
 * DISC is *derived* from a processed report; these two are *assigned* by a
 * person and stored on `profiles`. Nothing here is inferred from the PDF, the
 * scores, the position or the department.
 *
 * Pure and dependency-free, so the same allow-lists serve the select fields,
 * the filter checkboxes, the server action's validation and the query-string
 * parsing — one source of truth instead of four drifting copies.
 */

/**
 * The companies a profile can belong to.
 *
 * Stored verbatim in `profiles.company`; these codes are the identifier, not a
 * slug of something else, so no translation table is needed. A Postgres CHECK
 * constraint mirrors this list (see migration 0004).
 */
export const COMPANIES = [
  "CGPAN",
  "CGCR",
  "CGELS",
  "CGGUATE",
  "CGCOL",
  "CGVEN",
  "INGRLJ",
  "INGBEM",
  "ECAR",
  "ADINAAPP",
  "CORPIT/IA",
  "CORPPUBLI",
  "CORPVENTA",
  "CORPCOMPRA",
  "CORPRRHH",
] as const;

export type Company = (typeof COMPANIES)[number];

/**
 * The two kinds of person the system tracks.
 *
 * Code identifiers stay English to match the rest of the codebase; the Spanish
 * wording users read lives in `PROFILE_TYPE_LABELS_ES`.
 */
export const PROFILE_TYPES = ["RECRUITMENT", "CURRENT_EMPLOYEE"] as const;

export type ProfileType = (typeof PROFILE_TYPES)[number];

export const PROFILE_TYPE_LABELS_ES: Record<ProfileType, string> = {
  RECRUITMENT: "Proceso de reclutamiento",
  CURRENT_EMPLOYEE: "Colaborador actual",
};

/**
 * Narrows an untrusted string — a query parameter or a form field — to a known
 * company. Unknown values are dropped rather than reaching the database.
 */
export function isCompany(value: string): value is Company {
  return (COMPANIES as readonly string[]).includes(value);
}

/** Same contract as {@link isCompany}, for the Tipo field. */
export function isProfileType(value: string): value is ProfileType {
  return (PROFILE_TYPES as readonly string[]).includes(value);
}

export function profileTypeLabelEs(value: ProfileType): string {
  return PROFILE_TYPE_LABELS_ES[value];
}
