import { describe, expect, it } from "vitest";

import {
  classifyDisc,
  combinationLabelEs,
  describeCombination,
  describeDisc,
  discCombinationOf,
  DISC_COMBINATION_NOTE_ES,
  DISC_COMBINATIONS,
  DISC_DIMENSIONS,
  DISC_TIE_NOTE_ES,
  DISC_TRAITS,
  hasTie,
  isDiscCombination,
  topLettersLabel,
  type DiscCombination,
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

/**
 * The twelve ordered combinations.
 *
 * One case per combination, each with four distinct scores so the tie-break
 * never decides the answer — these prove the *ranking*, not the tie rule.
 * Mirrored pairs (DI/ID, DC/CD, …) use the same four numbers with the top two
 * swapped, which is what makes "order matters" a real assertion rather than a
 * restatement of the input.
 */
const COMBINATION_CASES: {
  combination: DiscCombination;
  scores: { dominance: number; influence: number; steadiness: number; control: number };
}[] = [
  { combination: "DI", scores: { dominance: 80, influence: 60, steadiness: 20, control: 10 } },
  { combination: "ID", scores: { dominance: 60, influence: 80, steadiness: 20, control: 10 } },
  { combination: "DC", scores: { dominance: 78, influence: 50, steadiness: 18, control: 53 } },
  { combination: "CD", scores: { dominance: 53, influence: 50, steadiness: 18, control: 78 } },
  { combination: "DS", scores: { dominance: 80, influence: 10, steadiness: 60, control: 20 } },
  { combination: "SD", scores: { dominance: 60, influence: 10, steadiness: 80, control: 20 } },
  { combination: "IC", scores: { dominance: 10, influence: 80, steadiness: 20, control: 60 } },
  { combination: "CI", scores: { dominance: 10, influence: 60, steadiness: 20, control: 80 } },
  { combination: "IS", scores: { dominance: 10, influence: 80, steadiness: 60, control: 20 } },
  { combination: "SI", scores: { dominance: 10, influence: 60, steadiness: 80, control: 20 } },
  { combination: "SC", scores: { dominance: 10, influence: 20, steadiness: 80, control: 60 } },
  { combination: "CS", scores: { dominance: 10, influence: 20, steadiness: 60, control: 80 } },
];

describe("DISC combination classification", () => {
  it.each(COMBINATION_CASES)(
    "classifies $combination from the stored scores",
    ({ combination, scores }) => {
      expect(discCombinationOf(scores)).toBe(combination);
    },
  );

  it("covers all twelve combinations, and only those twelve", () => {
    expect(COMBINATION_CASES.map((c) => c.combination).sort()).toEqual([...DISC_COMBINATIONS].sort());
    expect(DISC_COMBINATIONS).toHaveLength(12);
    expect(new Set(DISC_COMBINATIONS).size).toBe(12);
  });

  it("never produces a doubled letter — primary and secondary are always different", () => {
    for (const combination of DISC_COMBINATIONS) {
      const [primary, secondary] = [...combination];
      expect(primary).not.toBe(secondary);
    }
  });

  it("treats order as significant: DI and ID are different classifications", () => {
    const di = discCombinationOf({ dominance: 80, influence: 60, steadiness: 20, control: 10 });
    const id = discCombinationOf({ dominance: 60, influence: 80, steadiness: 20, control: 10 });

    expect(di).toBe("DI");
    expect(id).toBe("ID");
    expect(di).not.toBe(id);
  });

  it("treats DC and CD as different classifications", () => {
    const dc = discCombinationOf({ dominance: 78, influence: 50, steadiness: 18, control: 53 });
    const cd = discCombinationOf({ dominance: 53, influence: 50, steadiness: 18, control: 78 });

    expect(dc).toBe("DC");
    expect(cd).toBe("CD");
    expect(dc).not.toBe(cd);
  });

  it("derives the classification from the scores rather than storing one", () => {
    // The same candidate re-measured: only the numbers change, and the
    // classification follows them. Nothing here is looked up or hardcoded.
    const before = { dominance: 78, influence: 50, steadiness: 18, control: 53 };
    expect(discCombinationOf(before)).toBe("DC");

    const after = { ...before, control: 90 };
    expect(discCombinationOf(after)).toBe("CD");

    // And a one-point change at the top flips the order, because the ranking is
    // the only thing deciding it.
    expect(discCombinationOf({ dominance: 51, influence: 50, steadiness: 1, control: 2 })).toBe("DI");
    expect(discCombinationOf({ dominance: 49, influence: 50, steadiness: 1, control: 2 })).toBe("ID");
  });

  it("agrees with classifyDisc — one classification, not two implementations", () => {
    for (const { scores } of COMBINATION_CASES) {
      expect(discCombinationOf(scores)).toBe(classifyDisc(scores).combination);
    }
  });

  it("keeps the existing deterministic tie-break, and still flags the tie", () => {
    // D and I both 62: D wins on the fixed D > I > S > C order, unchanged.
    const scores = { dominance: 62, influence: 62, steadiness: 25, control: 50 };

    expect(discCombinationOf(scores)).toBe("DI");
    expect(hasTie(classifyDisc(scores))).toBe(true);
    // Repeatable, and the tie is reported rather than hidden.
    expect(discCombinationOf({ ...scores })).toBe("DI");
    expect(topLettersLabel(classifyDisc(scores))).toContain("Empate");
  });

  it("classifies an all-equal profile deterministically as DI and calls it a tie", () => {
    const scores = { dominance: 50, influence: 50, steadiness: 50, control: 50 };
    expect(discCombinationOf(scores)).toBe("DI");
    expect(hasTie(classifyDisc(scores))).toBe(true);
  });
});

describe("isDiscCombination", () => {
  it("accepts each of the twelve", () => {
    for (const combination of DISC_COMBINATIONS) expect(isDiscCombination(combination)).toBe(true);
  });

  it("rejects doubled letters, unknown letters, wrong lengths and casing", () => {
    for (const value of ["DD", "II", "SS", "CC", "XY", "D", "DIC", "", "di", "Di"]) {
      expect(isDiscCombination(value)).toBe(false);
    }
  });
});

describe("combinationLabelEs", () => {
  it("names both dimensions in order", () => {
    expect(combinationLabelEs("DC")).toBe("Dominancia / Control");
    expect(combinationLabelEs("CD")).toBe("Control / Dominancia");
    expect(combinationLabelEs("IS")).toBe("Influencia / Solidez");
  });

  it("labels every combination without gaps", () => {
    for (const combination of DISC_COMBINATIONS) {
      expect(combinationLabelEs(combination)).toMatch(/^[^/]+ \/ [^/]+$/);
    }
  });
});

describe("DISC explanatory copy", () => {
  it("explains the two letters without diagnostic language", () => {
    expect(DISC_COMBINATION_NOTE_ES).toContain("dos letras");
    expect(DISC_COMBINATION_NOTE_ES).toMatch(/predominantes/);
    expect(DISC_COMBINATION_NOTE_ES).not.toMatch(/diagn[oó]stic|enfermedad|trastorno/i);
  });

  it("says a tie is indicative rather than a finding", () => {
    expect(DISC_TIE_NOTE_ES).toMatch(/indicativo/);
  });
});
