import { describe, expect, it } from "vitest";

import {
  COMPANIES,
  isCompany,
  isProfileType,
  PROFILE_TYPES,
  profileTypeLabelEs,
  type Company,
} from "./classification";

/**
 * The allow-lists behind Tipo and Empresa.
 *
 * These two guards are the only gate between an untrusted string — a query
 * parameter or a submitted form field — and a CHECK-constrained column, so they
 * are tested directly. `/profiles` filters its `?company=` values through
 * `isCompany` exactly as reproduced here.
 */
describe("isCompany", () => {
  it("accepts every listed company", () => {
    for (const company of COMPANIES) expect(isCompany(company)).toBe(true);
  });

  it("rejects anything that is not on the list", () => {
    const rejected = [
      "",
      " CGPAN",
      "cgpan",
      "ACME",
      "CORPIT",
      "CGPAN'; drop table profiles; --",
      "DI",
      "RECRUITMENT",
    ];
    for (const value of rejected) expect(isCompany(value)).toBe(false);
  });

  it("keeps the fifteen company codes exactly as the migration lists them", () => {
    expect([...COMPANIES]).toEqual([
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
    ]);
  });
});

describe("query-string parsing of ?company=", () => {
  /** Mirrors `toCompanies` in src/app/profiles/page.tsx. */
  const parse = (values: string[]): Company[] => values.filter(isCompany);

  it("drops unknown values and keeps the valid ones", () => {
    expect(parse(["CGPAN", "ACME", "CGCR"])).toEqual(["CGPAN", "CGCR"]);
  });

  it("drops an entirely unknown selection rather than passing it to the database", () => {
    expect(parse(["ACME", "'; drop table profiles; --", "cgpan"])).toEqual([]);
  });

  it("preserves a code containing a slash, which survives URL encoding", () => {
    expect(parse([new URLSearchParams("company=CORPIT%2FIA").get("company")!])).toEqual([
      "CORPIT/IA",
    ]);
  });
});

describe("isProfileType", () => {
  it("accepts the two listed types", () => {
    for (const type of PROFILE_TYPES) expect(isProfileType(type)).toBe(true);
  });

  it("rejects anything else, including the Spanish labels", () => {
    for (const value of ["", "MANAGER", "recruitment", "Proceso de reclutamiento", "CGPAN"]) {
      expect(isProfileType(value)).toBe(false);
    }
  });

  it("reads back in Spanish", () => {
    expect(profileTypeLabelEs("RECRUITMENT")).toBe("Proceso de reclutamiento");
    expect(profileTypeLabelEs("CURRENT_EMPLOYEE")).toBe("Colaborador actual");
  });
});
