import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Company, ProfileType } from "@/lib/classification";

import type { DiscCombination } from "./pdf/disc";
import type { ProfileFilters } from "./profiles";

/**
 * Server-side profile filtering, including the DISC classification filter.
 *
 * Supabase is replaced with a small in-memory stand-in that understands the
 * handful of PostgREST operations `listProfiles` actually uses. That keeps the
 * real `listProfiles` in the test — the id intersection, the search folding, the
 * page limit and the DISC derivation all execute — while removing the database.
 *
 * The point of these tests is that filters COMBINE (AND across kinds, OR within
 * DISC) and that the classification is read off the stored scores every time.
 */

type Row = Record<string, unknown>;
type Database = Record<string, Row[]>;

/** The fixture, rebuilt before each test so a mutation cannot leak sideways. */
let db: Database;

/**
 * A chainable, awaitable stand-in for a PostgREST query builder.
 *
 * Operations are collected and applied on await, so the call order used by the
 * production code (`.order()` before or after `.in()`) does not matter.
 */
function makeBuilder(rows: Row[]) {
  const filters: ((row: Row) => boolean)[] = [];
  let sort: { column: string; ascending: boolean } | null = null;
  let take: number | null = null;
  let patch: Row | null = null;

  const run = () => {
    let result = rows.filter((row) => filters.every((keep) => keep(row)));

    // An UPDATE writes the patch onto the matched rows in place, so a test can
    // assert afterwards that the columns it did NOT mention still hold their
    // original values.
    if (patch) for (const row of result) Object.assign(row, patch);

    if (sort) {
      const { column, ascending } = sort;
      result = [...result].sort((a, b) => {
        const left = String(a[column] ?? "");
        const right = String(b[column] ?? "");
        return ascending ? left.localeCompare(right) : right.localeCompare(left);
      });
    }

    return take === null ? result : result.slice(0, take);
  };

  const builder = {
    select: () => builder,
    update: (values: Row) => {
      patch = values;
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return builder;
    },
    /** Only the `%needle%` form is used by the code under test. */
    like: (column: string, pattern: string) => {
      const needle = pattern.replaceAll("%", "");
      filters.push((row) => String(row[column] ?? "").includes(needle));
      return builder;
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      sort = { column, ascending: options?.ascending ?? true };
      return builder;
    },
    limit: (count: number) => {
      take = count;
      return builder;
    },
    then: (
      resolve: (value: { data: Row[]; error: null }) => unknown,
    ) => resolve({ data: run(), error: null }),
    maybeSingle: () => ({
      then: (resolve: (value: { data: Row | null; error: null }) => unknown) =>
        resolve({ data: run()[0] ?? null, error: null }),
    }),
  };

  return builder;
}

// `@/lib/env` validates the public Supabase variables at import time. The tests
// never reach Storage, so the upload constants are supplied directly rather than
// requiring a populated .env.local to run the suite.
vi.mock("@/lib/env", () => ({
  UPLOAD: {
    bucket: "profile-documents",
    maxBytes: 25 * 1024 * 1024,
    maxFilesPerBatch: 20,
    mimeType: "application/pdf",
  },
}));

// `server-only` throws outside a React Server Component graph; it is a build-time
// marker with no runtime behaviour, so it is stubbed out rather than worked around.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({
    from: (table: string) => makeBuilder(db[table] ?? []),
  }),
}));

/** Mirrors the `full_name_normalized` generated column: lower-cased, unaccented. */
function normalize(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

type Scores = { dominance: number; influence: number; steadiness: number; control: number };

type Candidate = {
  id: string;
  name: string;
  /** The combination these scores must produce. Asserted, never used to filter. */
  expected: string;
  scores: Scores | null;
  capabilities?: string[];
  attitudes?: string[];
  /** Assigned Empresa. Omitted means unassigned — NULL, matching no company filter. */
  company?: Company;
  /** Assigned Tipo. Independent of Empresa and of DISC. */
  profileType?: ProfileType;
};

/**
 * Thirteen candidates covering all twelve combinations, with DI appearing twice
 * so "DI" and "Ramírez" can disagree — plus one candidate with no assessment.
 */
const CANDIDATES: Candidate[] = [
  { id: "p01", name: "Ana Ramírez", expected: "DI", scores: { dominance: 80, influence: 60, steadiness: 20, control: 10 }, capabilities: ["sql", "react"], attitudes: ["colaboracion"], company: "CGPAN", profileType: "RECRUITMENT" },
  { id: "p02", name: "Bruno Ramírez", expected: "ID", scores: { dominance: 60, influence: 80, steadiness: 20, control: 10 }, capabilities: ["sql"], company: "CGCR", profileType: "CURRENT_EMPLOYEE" },
  { id: "p03", name: "Carla Ramírez", expected: "DC", scores: { dominance: 78, influence: 50, steadiness: 18, control: 53 }, capabilities: ["react"], company: "CGPAN" },
  { id: "p04", name: "Diego Soto", expected: "DI", scores: { dominance: 85, influence: 70, steadiness: 30, control: 15 }, capabilities: ["react"], attitudes: ["colaboracion"], company: "CGCR" },
  { id: "p05", name: "Elena Soto", expected: "CD", scores: { dominance: 53, influence: 50, steadiness: 18, control: 78 }, company: "CORPIT/IA" },
  { id: "p06", name: "Fabián Soto", expected: "DS", scores: { dominance: 80, influence: 10, steadiness: 60, control: 20 } },
  { id: "p07", name: "Gabriela Nieto", expected: "SD", scores: { dominance: 60, influence: 10, steadiness: 80, control: 20 } },
  { id: "p08", name: "Hugo Nieto", expected: "IC", scores: { dominance: 10, influence: 80, steadiness: 20, control: 60 } },
  { id: "p09", name: "Irene Nieto", expected: "CI", scores: { dominance: 10, influence: 60, steadiness: 20, control: 80 } },
  { id: "p10", name: "Julián Vega", expected: "IS", scores: { dominance: 10, influence: 80, steadiness: 60, control: 20 } },
  { id: "p11", name: "Karla Vega", expected: "SI", scores: { dominance: 10, influence: 60, steadiness: 80, control: 20 } },
  { id: "p12", name: "Luis Vega", expected: "SC", scores: { dominance: 10, influence: 20, steadiness: 80, control: 60 } },
  { id: "p13", name: "Marta Vega", expected: "CS", scores: { dominance: 10, influence: 20, steadiness: 60, control: 80 }, capabilities: ["sql"], company: "CGPAN" },
  // No processed report: has no classification, so no DISC filter can match it.
  // No processed report, but a full classification: Tipo/Empresa never depend on
  // DISC, on an assessment or on a PDF having been uploaded.
  { id: "p14", name: "Nadia Ortiz", expected: "—", scores: null, capabilities: ["sql"], company: "CGCR", profileType: "RECRUITMENT" },
];

function buildDatabase(): Database {
  const profiles: Row[] = [];
  const assessments: Row[] = [];
  const capabilities: Row[] = [];
  const attitudes: Row[] = [];

  CANDIDATES.forEach((candidate, index) => {
    profiles.push({
      id: candidate.id,
      full_name: candidate.name,
      full_name_normalized: normalize(candidate.name),
      // Unassigned is NULL, exactly as the migration leaves existing rows.
      company: candidate.company ?? null,
      profile_type: candidate.profileType ?? null,
      position: null,
      // Descending ids give a stable, predictable newest-first order.
      created_at: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    });

    if (candidate.scores) {
      assessments.push({
        profile_id: candidate.id,
        created_at: `2026-02-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        raw_scores: { profileGraph: 1, graphs: { 1: candidate.scores } },
      });
    }

    for (const code of candidate.capabilities ?? []) {
      capabilities.push({ profile_id: candidate.id, code, label: code });
    }
    for (const code of candidate.attitudes ?? []) {
      attitudes.push({ profile_id: candidate.id, code, label: code });
    }
  });

  return {
    profiles,
    profile_assessments: assessments,
    profile_capabilities: capabilities,
    profile_attitudes: attitudes,
  };
}

/** Names of the matching profiles, sorted so assertions do not depend on paging order. */
async function namesFor(filters: ProfileFilters) {
  const { listProfiles } = await import("./profiles");
  const profiles = await listProfiles(filters);
  return profiles.map((profile) => profile.full_name).sort();
}

beforeEach(() => {
  db = buildDatabase();
});

describe("listProfiles — DISC classification filter", () => {
  it("returns only DI candidates when DI is selected", async () => {
    expect(await namesFor({ disc: ["DI"] })).toEqual(["Ana Ramírez", "Diego Soto"]);
  });

  it("returns only DC candidates when DC is selected", async () => {
    expect(await namesFor({ disc: ["DC"] })).toEqual(["Carla Ramírez"]);
  });

  it("returns only CS candidates when CS is selected", async () => {
    expect(await namesFor({ disc: ["CS"] })).toEqual(["Marta Vega"]);
  });

  it("distinguishes a combination from its mirror — DI is not ID", async () => {
    expect(await namesFor({ disc: ["ID"] })).toEqual(["Bruno Ramírez"]);
    expect(await namesFor({ disc: ["CD"] })).toEqual(["Elena Soto"]);
    expect(await namesFor({ disc: ["DC"] })).not.toContain("Elena Soto");
  });

  it("matches every one of the twelve combinations against its own candidate", async () => {
    for (const candidate of CANDIDATES) {
      if (!candidate.scores) continue;
      const combination = candidate.expected as DiscCombination;
      expect(await namesFor({ disc: [combination] })).toContain(candidate.name);
    }
  });

  it("ORs multiple selected combinations", async () => {
    expect(await namesFor({ disc: ["DI", "CS"] })).toEqual([
      "Ana Ramírez",
      "Diego Soto",
      "Marta Vega",
    ]);
  });

  it("excludes candidates with no processed assessment — they have no classification", async () => {
    for (const combination of ["DI", "ID", "DC", "CD", "SC", "CS"] as const) {
      expect(await namesFor({ disc: [combination] })).not.toContain("Nadia Ortiz");
    }
  });

  it("derives the classification from the stored scores, not from a stored label", async () => {
    expect(await namesFor({ disc: ["DC"] })).toEqual(["Carla Ramírez"]);

    // Raise only Control in the stored report. Nothing else changes — no column
    // is updated, no label rewritten — yet the candidate reclassifies as CD.
    const assessment = db.profile_assessments.find((row) => row.profile_id === "p03")!;
    assessment.raw_scores = {
      profileGraph: 1,
      graphs: { 1: { dominance: 78, influence: 50, steadiness: 18, control: 90 } },
    };

    expect(await namesFor({ disc: ["DC"] })).toEqual([]);
    expect(await namesFor({ disc: ["CD"] })).toEqual(["Carla Ramírez", "Elena Soto"]);
  });
});

describe("listProfiles — DISC combined with the existing filters", () => {
  it('narrows "Ramírez" to the DI candidate only', async () => {
    expect(await namesFor({ q: "Ramírez", disc: ["DI"] })).toEqual(["Ana Ramírez"]);
  });

  it("matches an unaccented search the same way, then applies DISC", async () => {
    expect(await namesFor({ q: "Ramirez", disc: ["DC"] })).toEqual(["Carla Ramírez"]);
  });

  it("ANDs DISC against a capability filter", async () => {
    // Three candidates hold "sql", two are DI — only Ana is both.
    expect(await namesFor({ capabilities: ["sql"] })).toEqual([
      "Ana Ramírez",
      "Bruno Ramírez",
      "Marta Vega",
      "Nadia Ortiz",
    ]);
    expect(await namesFor({ capabilities: ["sql"], disc: ["DI"] })).toEqual(["Ana Ramírez"]);
  });

  it("ANDs DISC against an attitude filter", async () => {
    expect(await namesFor({ attitudes: ["colaboracion"], disc: ["DI"] })).toEqual([
      "Ana Ramírez",
      "Diego Soto",
    ]);
  });

  it("combines name, capability and DISC all at once", async () => {
    expect(
      await namesFor({ q: "Ramírez", capabilities: ["sql"], disc: ["DI"] }),
    ).toEqual(["Ana Ramírez"]);
  });

  it("returns an empty list when the combination excludes every match", async () => {
    expect(await namesFor({ q: "Ramírez", disc: ["SC"] })).toEqual([]);
    expect(await namesFor({ capabilities: ["react"], disc: ["CS"] })).toEqual([]);
    expect(await namesFor({ q: "no-such-person", disc: ["DI"] })).toEqual([]);
  });
});

describe("listProfiles — the existing filters still behave as before", () => {
  it("returns every profile when nothing is filtered", async () => {
    const { listProfiles } = await import("./profiles");
    expect(await listProfiles()).toHaveLength(CANDIDATES.length);
  });

  it("searches by name, accent-insensitively in both directions", async () => {
    expect(await namesFor({ q: "Ramírez" })).toEqual([
      "Ana Ramírez",
      "Bruno Ramírez",
      "Carla Ramírez",
    ]);
    expect(await namesFor({ q: "ramirez" })).toEqual([
      "Ana Ramírez",
      "Bruno Ramírez",
      "Carla Ramírez",
    ]);
  });

  it("ANDs multiple capabilities rather than widening the result", async () => {
    expect(await namesFor({ capabilities: ["sql", "react"] })).toEqual(["Ana Ramírez"]);
  });

  it("filters by attitude", async () => {
    expect(await namesFor({ attitudes: ["colaboracion"] })).toEqual([
      "Ana Ramírez",
      "Diego Soto",
    ]);
  });

  it("returns an empty list for an unknown capability", async () => {
    expect(await namesFor({ capabilities: ["cobol"] })).toEqual([]);
  });

  it("still attaches Graph 1 scores to each card, and null when unprocessed", async () => {
    const { listProfiles } = await import("./profiles");
    const profiles = await listProfiles({ q: "Ana" });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].graph1).toEqual({
      dominance: 80,
      influence: 60,
      steadiness: 20,
      control: 10,
    });

    const unprocessed = await listProfiles({ q: "Nadia" });
    expect(unprocessed[0].graph1).toBeNull();
  });
});

describe("listProfiles — Empresa filter", () => {
  it("returns only the profiles assigned to the selected company", async () => {
    expect(await namesFor({ companies: ["CGPAN"] })).toEqual([
      "Ana Ramírez",
      "Carla Ramírez",
      "Marta Vega",
    ]);
  });

  it("ORs multiple selected companies", async () => {
    expect(await namesFor({ companies: ["CGPAN", "CGCR"] })).toEqual([
      "Ana Ramírez",
      "Bruno Ramírez",
      "Carla Ramírez",
      "Diego Soto",
      "Marta Vega",
      "Nadia Ortiz",
    ]);
  });

  it("matches a company code containing a slash", async () => {
    expect(await namesFor({ companies: ["CORPIT/IA"] })).toEqual(["Elena Soto"]);
  });

  it("never returns profiles with no company assigned", async () => {
    const unassigned = ["Fabián Soto", "Gabriela Nieto", "Hugo Nieto"];
    for (const company of ["CGPAN", "CGCR", "CORPIT/IA"] as const) {
      const matched = await namesFor({ companies: [company] });
      for (const name of unassigned) expect(matched).not.toContain(name);
    }
  });

  it("returns an empty list for a company nobody is assigned to", async () => {
    expect(await namesFor({ companies: ["CORPRRHH"] })).toEqual([]);
  });

  it("applies no company constraint when the list is empty", async () => {
    const { listProfiles } = await import("./profiles");
    expect(await listProfiles({ companies: [] })).toHaveLength(CANDIDATES.length);
  });

  it("reads Empresa off the stored column, not off DISC or the position", async () => {
    expect(await namesFor({ companies: ["CGPAN"] })).toContain("Carla Ramírez");

    // Re-assign the stored value only. Nothing about the report changes.
    const profile = db.profiles.find((row) => row.id === "p03")!;
    profile.company = "CGVEN";

    expect(await namesFor({ companies: ["CGPAN"] })).not.toContain("Carla Ramírez");
    expect(await namesFor({ companies: ["CGVEN"] })).toEqual(["Carla Ramírez"]);
  });
});

describe("listProfiles — Empresa combined with the existing filters", () => {
  it("ANDs Empresa against DISC — (CGPAN OR CGCR) AND DI", async () => {
    expect(await namesFor({ companies: ["CGPAN", "CGCR"], disc: ["DI"] })).toEqual([
      "Ana Ramírez",
      "Diego Soto",
    ]);
  });

  it("ANDs Empresa against the name search", async () => {
    expect(await namesFor({ q: "Ramírez", companies: ["CGPAN"] })).toEqual([
      "Ana Ramírez",
      "Carla Ramírez",
    ]);
    expect(await namesFor({ q: "ramirez", companies: ["CGCR"] })).toEqual(["Bruno Ramírez"]);
  });

  it("ANDs Empresa against a capability filter", async () => {
    expect(await namesFor({ companies: ["CGPAN"], capabilities: ["sql"] })).toEqual([
      "Ana Ramírez",
      "Marta Vega",
    ]);
  });

  it("ANDs Empresa against an attitude filter", async () => {
    expect(await namesFor({ companies: ["CGCR"], attitudes: ["colaboracion"] })).toEqual([
      "Diego Soto",
    ]);
  });

  it("combines Empresa with name, capability, attitude and DISC all at once", async () => {
    expect(
      await namesFor({
        q: "Ramírez",
        companies: ["CGPAN", "CGCR"],
        capabilities: ["sql", "react"],
        attitudes: ["colaboracion"],
        disc: ["DI"],
      }),
    ).toEqual(["Ana Ramírez"]);
  });

  it("returns an empty list when Empresa excludes every other match", async () => {
    expect(await namesFor({ companies: ["CGPAN"], disc: ["ID"] })).toEqual([]);
    expect(await namesFor({ companies: ["CGCR"], capabilities: ["sql", "react"] })).toEqual([]);
  });

  it("keeps the DISC filter intact — Empresa does not replace it", async () => {
    expect(await namesFor({ disc: ["DI"] })).toEqual(["Ana Ramírez", "Diego Soto"]);
  });
});

describe("getProfile — stored classification", () => {
  it("loads the saved Tipo and Empresa", async () => {
    const { getProfile } = await import("./profiles");
    const profile = await getProfile("p01");

    expect(profile?.company).toBe("CGPAN");
    expect(profile?.profile_type).toBe("RECRUITMENT");
  });

  it("reports an unassigned classification as null rather than inventing one", async () => {
    const { getProfile } = await import("./profiles");
    const profile = await getProfile("p06");

    expect(profile?.company).toBeNull();
    expect(profile?.profile_type).toBeNull();
  });

  it("loads the classification of a profile that has no assessment at all", async () => {
    const { getProfile } = await import("./profiles");
    const profile = await getProfile("p14");

    expect(profile?.assessment).toBeNull();
    expect(profile?.company).toBe("CGCR");
    expect(profile?.profile_type).toBe("RECRUITMENT");
  });
});

describe("updateProfileClassification", () => {
  it("stores Tipo and Empresa on the profile", async () => {
    const { updateProfileClassification } = await import("./profiles");
    await updateProfileClassification("p06", {
      profile_type: "CURRENT_EMPLOYEE",
      company: "CORPRRHH",
    });

    const profile = db.profiles.find((row) => row.id === "p06")!;
    expect(profile.company).toBe("CORPRRHH");
    expect(profile.profile_type).toBe("CURRENT_EMPLOYEE");
    expect(await namesFor({ companies: ["CORPRRHH"] })).toEqual(["Fabián Soto"]);
  });

  it("leaves every other column on the row untouched", async () => {
    const { updateProfileClassification } = await import("./profiles");
    const before = { ...db.profiles.find((row) => row.id === "p01")! };

    await updateProfileClassification("p01", {
      profile_type: "CURRENT_EMPLOYEE",
      company: "ECAR",
    });

    const after = db.profiles.find((row) => row.id === "p01")!;
    expect(after.full_name).toBe(before.full_name);
    expect(after.full_name_normalized).toBe(before.full_name_normalized);
    expect(after.created_at).toBe(before.created_at);
    expect(after.position).toBe(before.position);
  });

  it("clears an assignment back to null", async () => {
    const { updateProfileClassification } = await import("./profiles");
    await updateProfileClassification("p01", { profile_type: null, company: null });

    const profile = db.profiles.find((row) => row.id === "p01")!;
    expect(profile.company).toBeNull();
    expect(profile.profile_type).toBeNull();
    expect(await namesFor({ companies: ["CGPAN"] })).toEqual(["Carla Ramírez", "Marta Vega"]);
  });

  it("rejects an id that matches no candidate", async () => {
    const { updateProfileClassification } = await import("./profiles");
    await expect(
      updateProfileClassification("p99", { profile_type: null, company: "CGPAN" }),
    ).rejects.toThrow("Candidato no encontrado.");
  });
});
