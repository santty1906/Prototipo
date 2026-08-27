/**
 * Deterministic DISC classification and interpretation.
 *
 * Pure and dependency-free so it can be tested without a PDF or a database.
 *
 * SCOPE AND LIMITS
 * ----------------
 * This layer does exactly two things: it ranks the four measured factors, and
 * it maps each factor to a fixed list of workplace descriptors. It applies no
 * psychological thresholds, no norms, and no cut-offs, because the source report
 * defines none — inventing them would dress up arithmetic as assessment.
 *
 * The output is a reading of reported scores, not a diagnosis. Wording is
 * deliberately hedged ("Based on the reported DISC scores...") and callers
 * should preserve that framing.
 */

import type { FactorScores } from "./competences-report";

export type DiscLetter = "D" | "I" | "S" | "C";

export type DiscFactor = {
  letter: DiscLetter;
  /** English label, used in code and in the AI context. */
  name: string;
  /** Spanish label, used in the UI. */
  labelEs: string;
  /** 0-100, exactly as reported. */
  score: number;
};

export type DiscProfile = {
  /** All four factors, highest score first. */
  ranked: DiscFactor[];
  primary: DiscFactor;
  secondary: DiscFactor;
  /** Primary + secondary letters, e.g. "DC". */
  combination: string;
  /** e.g. "Dominance / Control". */
  combinationName: string;
  /** e.g. "Dominancia / Control". */
  combinationNameEs: string;
};

const FACTOR_META: Record<DiscLetter, { name: string; labelEs: string; key: keyof FactorScores }> = {
  D: { name: "Dominance", labelEs: "Dominancia", key: "dominance" },
  I: { name: "Influence", labelEs: "Influencia", key: "influence" },
  S: { name: "Steadiness", labelEs: "Solidez", key: "steadiness" },
  C: { name: "Control", labelEs: "Control", key: "control" },
};

/**
 * Tie-break order, applied when two factors share a score.
 *
 * Fixed as D > I > S > C purely so the same report always yields the same
 * profile. It carries no interpretive meaning — a tie is genuinely a tie, and
 * `hasTie()` lets callers say so.
 */
const TIE_BREAK: DiscLetter[] = ["D", "I", "S", "C"];

/**
 * Ranks the four factors of one graph.
 *
 * Graph 1 (ADAPTACION LABORAL) is the report's picture of behaviour at work and
 * is what the application treats as the working profile; graphs 2 and 3 are
 * classified on demand for comparison.
 */
export function classifyDisc(scores: FactorScores): DiscProfile {
  const ranked = TIE_BREAK.map((letter) => {
    const meta = FACTOR_META[letter];
    return { letter, name: meta.name, labelEs: meta.labelEs, score: scores[meta.key] };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return TIE_BREAK.indexOf(a.letter) - TIE_BREAK.indexOf(b.letter);
  });

  const [primary, secondary] = ranked;

  return {
    ranked,
    primary,
    secondary,
    combination: `${primary.letter}${secondary.letter}`,
    combinationName: `${primary.name} / ${secondary.name}`,
    combinationNameEs: `${primary.labelEs} / ${secondary.labelEs}`,
  };
}

/** True when the primary and secondary scores are equal, so the ordering was decided by tie-break. */
export function hasTie(profile: DiscProfile): boolean {
  return profile.primary.score === profile.secondary.score;
}

/**
 * Workplace descriptors per factor.
 *
 * A fixed vocabulary, not generated text. These describe tendencies associated
 * with a high score on that factor; they are not claims about the person.
 */
export const DISC_TRAITS: Record<DiscLetter, { en: string[]; es: string[] }> = {
  D: {
    en: ["Results-oriented", "Direct", "Competitive", "Decisive", "Comfortable with challenges"],
    es: ["Orientado a resultados", "Directo", "Competitivo", "Decidido", "Cómodo ante los retos"],
  },
  I: {
    en: ["Persuasive", "Sociable", "Communicative", "Optimistic", "Influential"],
    es: ["Persuasivo", "Sociable", "Comunicativo", "Optimista", "Influyente"],
  },
  S: {
    en: ["Patient", "Stable", "Cooperative", "Consistent", "Team-oriented"],
    es: ["Paciente", "Estable", "Cooperativo", "Constante", "Orientado al equipo"],
  },
  C: {
    en: ["Analytical", "Precise", "Structured", "Procedure-oriented", "Detail-conscious"],
    es: ["Analítico", "Preciso", "Estructurado", "Orientado a procedimientos", "Atento al detalle"],
  },
};

/** What each graph measures. Graph 1 is the working profile. */
export const GRAPH_LABELS = {
  1: { es: "Adaptación Laboral", en: "Work Adaptation" },
  2: { es: "Conducta Bajo Presión", en: "Behaviour Under Pressure" },
  3: { es: "Imagen Propia", en: "Self Image" },
} as const;

/**
 * What each dimension observes, for the reader who has never seen DISC.
 *
 * Phrased as "how the person responds to X" — a description of behaviour the
 * instrument looks at, not a claim about the person.
 */
export const DISC_DIMENSIONS: Record<DiscLetter, { labelEs: string; descriptionEs: string }> = {
  D: {
    labelEs: "Dominancia",
    descriptionEs: "Cómo responde a retos, decisiones, resultados y autoridad.",
  },
  I: {
    labelEs: "Influencia",
    descriptionEs: "Cómo se relaciona, comunica, persuade y motiva a otras personas.",
  },
  S: {
    labelEs: "Solidez / Estabilidad",
    descriptionEs: "Cómo responde al ritmo, los cambios, la paciencia y la estabilidad.",
  },
  C: {
    labelEs: "Control / Cumplimiento",
    descriptionEs: "Cómo responde a reglas, procedimientos, precisión y atención al detalle.",
  },
};

/**
 * One short clause per factor, used to compose a combination description.
 *
 * Kept separate from DISC_TRAITS because a sentence needs a phrase, not a list
 * of adjectives. Both come from the same fixed vocabulary — nothing is generated.
 */
const COMBINATION_CLAUSES: Record<DiscLetter, string> = {
  D: "la orientación a resultados y la toma de decisiones",
  I: "la comunicación, la persuasión y la relación con otras personas",
  S: "la constancia, la paciencia y el trabajo estable en equipo",
  C: "la precisión, el orden y el apego a procedimientos",
};

/**
 * A short, hedged description of the primary/secondary combination.
 *
 * Deterministic: the same two letters always produce the same sentence. Uses
 * suggestive wording ("El resultado sugiere...") because a ranking of four
 * scores does not support a stronger claim.
 */
export function describeCombination(profile: DiscProfile): string {
  const primary = COMBINATION_CLAUSES[profile.primary.letter];
  const secondary = COMBINATION_CLAUSES[profile.secondary.letter];

  if (hasTie(profile)) {
    return (
      `El resultado muestra un empate entre ${profile.primary.labelEs} y ` +
      `${profile.secondary.labelEs} (${profile.primary.score}%). El perfil sugiere una ` +
      `tendencia tanto hacia ${primary} como hacia ${secondary}.`
    );
  }

  return (
    `El resultado sugiere un perfil con énfasis en ${primary}, apoyado en ` +
    `${secondary}. El perfil muestra una tendencia hacia ` +
    `${profile.primary.labelEs} como estilo predominante y ` +
    `${profile.secondary.labelEs} como estilo secundario.`
  );
}

/**
 * How to label the top of the ranking, in Spanish.
 *
 * A tie is reported as a tie ("Empate entre D e I") rather than silently
 * resolved, so the UI never presents a coin-flip as a finding.
 */
export function topLettersLabel(profile: DiscProfile): string {
  if (hasTie(profile)) {
    return `Empate entre ${profile.primary.letter} e ${profile.secondary.letter}`;
  }
  return `Perfil predominante: ${profile.combination}`;
}

/**
 * A short, hedged summary of a profile, for the UI and the AI context.
 *
 * States what was measured and what the ranking is. Makes no claim the scores
 * do not support.
 */
export function describeDisc(profile: DiscProfile, locale: "en" | "es" = "es"): string {
  const tie = hasTie(profile)
    ? locale === "es"
      ? " Las dos puntuaciones más altas están empatadas, por lo que el orden es indicativo."
      : " The top two scores are tied, so the ordering is indicative only."
    : "";

  if (locale === "es") {
    return (
      `Según las puntuaciones DISC registradas (Gráfica 1 — Adaptación Laboral), ` +
      `el factor predominante es ${profile.primary.labelEs} (${profile.primary.score}) ` +
      `y el secundario ${profile.secondary.labelEs} (${profile.secondary.score}).` +
      tie
    );
  }

  return (
    `Based on the reported DISC scores (Graph 1 — Work Adaptation), ` +
    `the leading factor is ${profile.primary.name} (${profile.primary.score}) ` +
    `and the secondary factor is ${profile.secondary.name} (${profile.secondary.score}).` +
    tie
  );
}
