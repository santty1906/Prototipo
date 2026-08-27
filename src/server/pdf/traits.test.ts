import { describe, expect, it } from "vitest";

import {
  ATTITUDE_VOCABULARY,
  COMPETENCY_VOCABULARY,
  extractTraits,
} from "./traits";

const codes = (traits: { code: string }[]) => traits.map((t) => t.code);

describe("extractTraits", () => {
  it("finds competencies and attitudes in report prose", () => {
    const { capabilities, attitudes } = extractTraits({
      conductas_observables_graph_1:
        "Persona influyente y persuasiva, directa y franca en su trato.",
      motivadores: "Le motiva el reconocimiento y la autoridad sobre un equipo.",
      otros_comentarios: "Analitico en la toma de decisiones y disciplinado.",
    });

    expect(codes(capabilities)).toEqual(
      expect.arrayContaining(["persuasion", "analysis", "decision-making", "teamwork", "discipline"]),
    );
    expect(codes(attitudes)).toEqual(
      expect.arrayContaining(["direct", "disciplined", "achievement-oriented"]),
    );
  });

  it("matches regardless of accents", () => {
    const withAccents = extractTraits({ a: "Es analítico y muy dinámico." });
    const without = extractTraits({ a: "Es analitico y muy dinamico." });

    expect(codes(withAccents.capabilities)).toEqual(codes(without.capabilities));
    expect(codes(withAccents.attitudes)).toEqual(codes(without.attitudes));
    expect(codes(withAccents.capabilities)).toContain("analysis");
    expect(codes(withAccents.attitudes)).toContain("dynamic");
  });

  it("matches whole words only, so a substring cannot trigger a trait", () => {
    // "directamente" must not fire `direct`; "equipamiento" must not fire `teamwork`.
    const { capabilities, attitudes } = extractTraits({
      a: "Actua directamente sobre el equipamiento industrial.",
    });

    expect(codes(attitudes)).not.toContain("direct");
    expect(codes(capabilities)).not.toContain("teamwork");
  });

  it("is deterministic and free of duplicates", () => {
    const sections = { a: "Lider, liderazgo, lidera. Competitivo y competitivo." };
    const first = extractTraits(sections);
    const second = extractTraits(sections);

    expect(first).toEqual(second);
    expect(codes(first.capabilities)).toEqual([...new Set(codes(first.capabilities))]);
    expect(codes(first.attitudes)).toEqual([...new Set(codes(first.attitudes))]);
  });

  it("returns empty arrays rather than throwing on empty input", () => {
    expect(extractTraits({})).toEqual({ capabilities: [], attitudes: [] });
    expect(extractTraits({ a: null, b: "   " })).toEqual({ capabilities: [], attitudes: [] });
  });

  it("only ever emits codes from the published vocabularies", () => {
    const competencyCodes = new Set(COMPETENCY_VOCABULARY.map((e) => e.code));
    const attitudeCodes = new Set(ATTITUDE_VOCABULARY.map((e) => e.code));

    const { capabilities, attitudes } = extractTraits({
      a: "Liderazgo, comunicacion, persuasion, analisis, decisiones, problemas, resultados, equipo, disciplina.",
      b: "Competitivo, optimista, sociable, dinamico, positivo, persistente, directo, disciplinado, adaptable, reconocimiento.",
    });

    for (const trait of capabilities) expect(competencyCodes.has(trait.code)).toBe(true);
    for (const trait of attitudes) expect(attitudeCodes.has(trait.code)).toBe(true);

    // The vocabularies are a closed set, which is what keeps the filter
    // checkboxes stable when an LLM later replaces this implementation.
    expect(capabilities).toHaveLength(COMPETENCY_VOCABULARY.length);
    expect(attitudes).toHaveLength(ATTITUDE_VOCABULARY.length);
  });

  it("does not read names or numbers, only the sections it is given", () => {
    // A candidate surnamed "Franco" must not be tagged `direct`.
    const { attitudes } = extractTraits({ a: "78 50 56 53" });
    expect(attitudes).toEqual([]);
  });
});
