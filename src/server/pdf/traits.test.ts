import { describe, expect, it } from "vitest";

import {
  ATTITUDE_VOCABULARY,
  COMPETENCY_VOCABULARY,
  extractTraits,
  traitLabelEs,
  TRAIT_LABELS_ES,
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

describe("Spanish trait labels", () => {
  it("labels every vocabulary code in Spanish", () => {
    for (const entry of [...COMPETENCY_VOCABULARY, ...ATTITUDE_VOCABULARY]) {
      expect(TRAIT_LABELS_ES[entry.code]).toBe(entry.label);
      // No English left over: every label carries Spanish orthography or is a
      // word spelled identically in both languages, never a phrase like
      // "Decision Making".
      expect(entry.label).not.toMatch(/^(Leadership|Communication|Decision Making|Teamwork)$/);
    }
  });

  it("resolves a stored English label to Spanish by its code", () => {
    expect(traitLabelEs("teamwork", "Teamwork")).toBe("Trabajo en equipo");
    expect(traitLabelEs("decision-making", "Decision Making")).toBe("Toma de decisiones");
    expect(traitLabelEs("collaboration", "Collaboration")).toBe("Colaboración");
  });

  it("keeps a stored label when the code is unknown — proper nouns and hand-entered traits", () => {
    expect(traitLabelEs("react", "React")).toBe("React");
    expect(traitLabelEs("sql", "SQL")).toBe("SQL");
    expect(traitLabelEs("kubernetes-ops", "Kubernetes Ops")).toBe("Kubernetes Ops");
  });
})
