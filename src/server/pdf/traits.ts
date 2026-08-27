/**
 * Deterministic competency and attitude extraction.
 *
 * Pure and dependency-free, like the parser, so it can be tested from a string.
 *
 * REPLACING THIS WITH AN LLM: everything below the `extractTraits` signature is
 * an implementation detail. Swap the body for a model call that returns the same
 * `{ capabilities, attitudes }` shape drawn from the same two vocabularies, and
 * nothing downstream changes — not the RPC, not the tables, not the filter UI.
 * That is why the vocabularies are exported: an LLM prompt should be constrained
 * to these codes so the filter checkboxes stay a closed set.
 */

export type Trait = { code: string; label: string };

type VocabularyEntry = Trait & {
  /**
   * Lower-case, accent-free terms. A match is a whole-word hit, so "analisis"
   * does not fire on "analisisdedatos" and "directo" does not fire on
   * "directamente".
   */
  terms: string[];
};

/** Abilities the report demonstrates. */
export const COMPETENCY_VOCABULARY: VocabularyEntry[] = [
  {
    code: "leadership",
    label: "Leadership",
    terms: ["liderazgo", "lider", "lidera", "dirigir", "dirige", "mando", "autoridad sobre"],
  },
  {
    code: "communication",
    label: "Communication",
    terms: ["comunicacion", "comunica", "comunicativo", "expresa", "expresarse", "verbal"],
  },
  {
    code: "persuasion",
    label: "Persuasion",
    terms: [
      "persuasion",
      "persuasivo",
      "persuade",
      "convencer",
      "convence",
      "influyente",
      "influir",
      "influencia",
      "consentimiento",
    ],
  },
  {
    code: "analysis",
    label: "Analysis",
    terms: ["analisis", "analitico", "analitica", "analiza", "analizar", "evalua"],
  },
  {
    code: "decision-making",
    label: "Decision Making",
    terms: ["decision", "decisiones", "decide", "decidido", "decidir"],
  },
  {
    code: "problem-solving",
    label: "Problem Solving",
    terms: ["problema", "problemas", "resolucion", "resuelve", "resolver", "soluciona", "solucion"],
  },
  {
    code: "results-orientation",
    label: "Results Orientation",
    terms: ["resultado", "resultados", "objetivo", "objetivos", "meta", "metas", "logro", "logros"],
  },
  {
    code: "teamwork",
    label: "Teamwork",
    terms: ["equipo", "equipos", "colabora", "colaborativo", "cooperar", "grupo"],
  },
  {
    code: "discipline",
    label: "Discipline",
    terms: ["disciplina", "disciplinado", "riguroso", "rigor", "metodico", "sistematico"],
  },
];

/** Behavioural and personality characteristics. */
export const ATTITUDE_VOCABULARY: VocabularyEntry[] = [
  {
    code: "competitive",
    label: "Competitive",
    terms: ["competitivo", "competitiva", "competencia", "competir", "reta", "retos"],
  },
  { code: "optimistic", label: "Optimistic", terms: ["optimista", "optimismo"] },
  {
    code: "sociable",
    label: "Sociable",
    terms: ["sociable", "sociabilidad", "social", "gente", "relaciones"],
  },
  {
    code: "dynamic",
    label: "Dynamic",
    terms: ["dinamico", "dinamica", "dinamismo", "activo", "energico", "agresivo"],
  },
  { code: "positive", label: "Positive", terms: ["positivo", "positiva", "positivamente"] },
  {
    code: "persistent",
    label: "Persistent",
    terms: ["persistente", "persistencia", "constante", "tenaz", "insiste", "perseverancia"],
  },
  {
    code: "direct",
    label: "Direct",
    terms: ["directo", "directa", "franco", "franca", "frontal", "sincero"],
  },
  { code: "disciplined", label: "Disciplined", terms: ["disciplinado", "disciplinada"] },
  {
    code: "adaptable",
    label: "Adaptable",
    terms: ["adaptable", "adapta", "adaptacion", "versatil", "flexible", "ajusta"],
  },
  {
    code: "achievement-oriented",
    label: "Achievement Oriented",
    terms: ["reconocimiento", "ambicion", "ambicioso", "superacion", "destacar", "prestigio"],
  },
];

/** Lower-cases and strips accents, so "análisis" and "analisis" both match. */
export function normalizeForMatching(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const WORD_BOUNDARY = "[^a-z0-9]";

/** Whole-word (or whole-phrase) containment test on already-normalised text. */
function containsTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|${WORD_BOUNDARY})${escaped}($|${WORD_BOUNDARY})`).test(haystack);
}

function matchVocabulary(haystack: string, vocabulary: VocabularyEntry[]): Trait[] {
  return vocabulary
    .filter((entry) => entry.terms.some((term) => containsTerm(haystack, term)))
    .map(({ code, label }) => ({ code, label }));
}

/**
 * The prose the vocabularies are matched against.
 *
 * Only descriptive sections are used. Names, dates and score tables are excluded
 * so a candidate called "Franco" is not tagged as `direct`.
 */
export function traitSourceText(sections: Record<string, string | null>): string {
  return normalizeForMatching(Object.values(sections).filter(Boolean).join("\n"));
}

/**
 * Derives competencies and attitudes from a parsed report's prose.
 *
 * Deterministic: the same text always yields the same codes, in vocabulary
 * order, with no duplicates. Returns empty arrays rather than throwing when the
 * report has no usable prose.
 */
export function extractTraits(sections: Record<string, string | null>): {
  capabilities: Trait[];
  attitudes: Trait[];
} {
  const haystack = traitSourceText(sections);

  if (!haystack.trim()) {
    return { capabilities: [], attitudes: [] };
  }

  return {
    capabilities: matchVocabulary(haystack, COMPETENCY_VOCABULARY),
    attitudes: matchVocabulary(haystack, ATTITUDE_VOCABULARY),
  };
}
