import { describe, expect, it } from "vitest";

import {
  classifyDisc,
  describeCombination,
  describeDisc,
  DISC_DIMENSIONS,
  DISC_TRAITS,
  hasTie,
  topLettersLabel,
} from "./disc";

/** Graph 1 of the real TIMS report for Nicolás Gallo Aranda. */
const REAL_GRAPH_1 = { dominance: 78, influence: 50, steadiness: 18, control: 53 };

describe("classifyDisc", () => {
  it("ranks the real report's Graph 1 as DC", () => {
    const disc = classifyDisc(REAL_GRAPH_1);

    expect(disc.primary.letter).toBe("D");
    expect(disc.primary.score).toBe(78);
    expect(disc.secondary.letter).toBe("C");
    expect(disc.secondary.score).toBe(53);
    expect(disc.combination).toBe("DC");
    expect(disc.combinationName).toBe("Dominance / Control");
  });

  it("orders all four factors by score, highest first", () => {
    const disc = classifyDisc(REAL_GRAPH_1);
    expect(disc.ranked.map((f) => f.letter)).toEqual(["D", "C", "I", "S"]);
    expect(disc.ranked.map((f) => f.score)).toEqual([78, 53, 50, 18]);
  });

  it("reports the scores unchanged — no scaling or normalisation", () => {
    const disc = classifyDisc(REAL_GRAPH_1);
    const byLetter = Object.fromEntries(disc.ranked.map((f) => [f.letter, f.score]));
    expect(byLetter).toEqual({ D: 78, I: 50, S: 18, C: 53 });
  });

  it("classifies Graph 2 of the real report as ID", () => {
    const disc = classifyDisc({ dominance: 56, influence: 75, steadiness: 26, control: 50 });
    expect(disc.combination).toBe("ID");
  });

  it("breaks ties deterministically in D > I > S > C order and flags them", () => {
    // Graph 3 of the real report: D and I are both 62.
    const disc = classifyDisc({ dominance: 62, influence: 62, steadiness: 25, control: 50 });

    expect(disc.combination).toBe("DI");
    expect(hasTie(disc)).toBe(true);
    // Same input, same output, every time.
    expect(classifyDisc({ dominance: 62, influence: 62, steadiness: 25, control: 50 })).toEqual(disc);
  });

  it("does not flag a tie when the top two differ", () => {
    expect(hasTie(classifyDisc(REAL_GRAPH_1))).toBe(false);
  });

  it("handles an all-equal profile without throwing", () => {
    const disc = classifyDisc({ dominance: 50, influence: 50, steadiness: 50, control: 50 });
    expect(disc.combination).toBe("DI");
    expect(hasTie(disc)).toBe(true);
  });
});

describe("describeDisc", () => {
  it("hedges rather than asserting, in both languages", () => {
    const disc = classifyDisc(REAL_GRAPH_1);

    const en = describeDisc(disc, "en");
    expect(en).toContain("Based on the reported DISC scores");
    expect(en).toContain("Graph 1");
    expect(en).not.toMatch(/definitely|certainly|proves|diagnos/i);

    const es = describeDisc(disc, "es");
    expect(es).toContain("Según las puntuaciones DISC registradas");
    expect(es).not.toMatch(/definitivamente|diagnóstic/i);
  });

  it("says so when the ordering came from a tie-break", () => {
    const disc = classifyDisc({ dominance: 62, influence: 62, steadiness: 25, control: 50 });
    expect(describeDisc(disc, "en")).toContain("tied");
    expect(describeDisc(disc, "es")).toContain("empatadas");
  });
});

describe("DISC_TRAITS", () => {
  it("provides five descriptors per factor in both languages", () => {
    for (const letter of ["D", "I", "S", "C"] as const) {
      expect(DISC_TRAITS[letter].en).toHaveLength(5);
      expect(DISC_TRAITS[letter].es).toHaveLength(5);
    }
  });

  it("uses the documented vocabulary", () => {
    expect(DISC_TRAITS.D.en).toContain("Results-oriented");
    expect(DISC_TRAITS.I.en).toContain("Persuasive");
    expect(DISC_TRAITS.S.en).toContain("Patient");
    expect(DISC_TRAITS.C.en).toContain("Analytical");
  });
});

describe("DISC presentation helpers", () => {
  it("explains all four dimensions without diagnostic language", () => {
    for (const letter of ["D", "I", "S", "C"] as const) {
      const dimension = DISC_DIMENSIONS[letter];
      expect(dimension.labelEs.length).toBeGreaterThan(0);
      expect(dimension.descriptionEs).toMatch(/^Cómo/);
      expect(dimension.descriptionEs).not.toMatch(/diagnóstic|trastorno|patolog|enfermedad/i);
    }
    expect(DISC_DIMENSIONS.D.labelEs).toBe("Dominancia");
    expect(DISC_DIMENSIONS.S.labelEs).toBe("Solidez / Estabilidad");
    expect(DISC_DIMENSIONS.C.labelEs).toBe("Control / Cumplimiento");
  });

  it("describes the DC combination with hedged wording", () => {
    const description = describeCombination(classifyDisc(REAL_GRAPH_1));

    expect(description).toContain("El resultado sugiere");
    expect(description).toContain("Dominancia");
    expect(description).toContain("Control");
    expect(description).not.toMatch(/definitivamente|siempre será|es un|diagnóstic/i);
  });

  it("is deterministic — the same scores always yield the same description", () => {
    const first = describeCombination(classifyDisc(REAL_GRAPH_1));
    const second = describeCombination(classifyDisc({ ...REAL_GRAPH_1 }));
    expect(first).toBe(second);
  });

  it("labels the top letters, and names a tie as a tie", () => {
    expect(topLettersLabel(classifyDisc(REAL_GRAPH_1))).toBe("Perfil predominante: DC");

    const tied = classifyDisc({ dominance: 62, influence: 62, steadiness: 25, control: 50 });
    expect(topLettersLabel(tied)).toBe("Empate entre D e I");
    // A tie must not be presented as a dominant letter.
    expect(topLettersLabel(tied)).not.toContain("Perfil predominante");
    expect(describeCombination(tied)).toContain("empate");
  });
});

describe("DISC percentages for display", () => {
  it("reports raw 0-100 scores that do NOT sum to 100", () => {
    const disc = classifyDisc(REAL_GRAPH_1);
    const total = disc.ranked.reduce((sum, factor) => sum + factor.score, 0);

    expect(total).toBe(199);
    expect(total).not.toBe(100);
    // Nothing is normalised: each score is exactly what the report recorded.
    expect(disc.ranked.map((f) => f.score)).toEqual([78, 53, 50, 18]);
  });

  it("keeps every score within the 0-100 bar range", () => {
    for (const factor of classifyDisc(REAL_GRAPH_1).ranked) {
      expect(factor.score).toBeGreaterThanOrEqual(0);
      expect(factor.score).toBeLessThanOrEqual(100);
    }
  });

  it("reflects whatever scores it is given, never a hardcoded sample", () => {
    const other = classifyDisc({ dominance: 10, influence: 90, steadiness: 40, control: 20 });
    expect(other.combination).toBe("IS");
    expect(other.ranked.map((f) => f.score)).toEqual([90, 40, 20, 10]);
  });
});
