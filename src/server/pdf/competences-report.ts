/**
 * Parser for the "PERSONAL COMPETENCES ANALYSIS" report.
 *
 * Pure and dependency-free on purpose: it takes a string and returns data, so it
 * can be tested against a fixture without a PDF, Supabase, or a network. Nothing
 * in here may import `server-only`, Supabase, or Node built-ins.
 *
 * The text it receives is what pdf.js produces for a multi-page report, which
 * means it is littered with artefacts: the title and the "Nombre:" / "Fecha:"
 * lines repeat on every page, and each page ends with a copyright notice and a
 * page number. All of that is treated as noise and dropped, which also rejoins a
 * prose section that was split across a page break.
 */

export type ScoreBlock = {
  /** The four measurements, in document order. */
  values: number[];
  /** The same values keyed by factor, when four factors and four values are present. */
  byFactor: Record<string, number> | null;
};

export type CompetencesReport = {
  full_name: string | null;
  report_date: string | null;
  scores: {
    adaptacion_laboral: ScoreBlock | null;
    conducta_bajo_presion: ScoreBlock | null;
    imagen_propia: ScoreBlock | null;
  };
  /** Measurement factors found, in document order. */
  factors: string[];
  /**
   * One percentage per graph from "RESUMEN POR GRÁFICO (%)", indexed 1-3.
   * Null when the report has no summary table.
   */
  graphSummary: { 1: number | null; 2: number | null; 3: number | null };
  sections: {
    conductas_observables_graph_1: string | null;
    conductas_observables_graph_2: string | null;
    conductas_observables_graph_3: string | null;
    motivadores: string | null;
    entorno_laboral_ideal: string | null;
    otros_comentarios: string | null;
  };
  /** Non-fatal problems: a missing section, a short score row, an unreadable date. */
  warnings: string[];
};

type SectionKey = keyof CompetencesReport["sections"];
type ScoreKey = keyof CompetencesReport["scores"];

/** Headings are matched accent- and punctuation-insensitively against these. */
const SECTION_HEADINGS: { key: SectionKey; heading: string }[] = [
  { key: "conductas_observables_graph_1", heading: "CONDUCTAS OBSERVABLES (GRAFICA 1)" },
  { key: "conductas_observables_graph_2", heading: "CONDUCTAS OBSERVABLES (GRAFICA 2)" },
  { key: "conductas_observables_graph_3", heading: "CONDUCTAS OBSERVABLES (GRAFICA 3)" },
  { key: "motivadores", heading: "MOTIVADORES" },
  { key: "entorno_laboral_ideal", heading: "ENTORNO LABORAL IDEAL" },
  { key: "otros_comentarios", heading: "OTROS COMENTARIOS" },
];

const SCORE_HEADINGS: { key: ScoreKey; heading: string }[] = [
  { key: "adaptacion_laboral", heading: "ADAPTACION LABORAL" },
  { key: "conducta_bajo_presion", heading: "CONDUCTA BAJO PRESION" },
  { key: "imagen_propia", heading: "IMAGEN PROPIA" },
];

export const MEASUREMENT_FACTORS = ["DOMINANCIA", "INFLUENCIA", "SOLIDEZ", "CONTROL"] as const;

/**
 * Which named scale each graph plots, taken from the real report.
 * Exported because the persistence layer needs the same mapping.
 */
export const GRAPH_SCALES = {
  1: "adaptacion_laboral",
  2: "conducta_bajo_presion",
  3: "imagen_propia",
} as const satisfies Record<1 | 2 | 3, ScoreKey>;

const FACTORS_HEADING = "FACTORES DE MEDICION";

/** Every line that ends a prose section. A section runs until the next one of these. */
const ALL_HEADINGS: string[] = [
  ...SECTION_HEADINGS.map((s) => s.heading),
  ...SCORE_HEADINGS.map((s) => s.heading),
  FACTORS_HEADING,
  ...MEASUREMENT_FACTORS,
];

/**
 * Headings that carry no prose of their own but must still end the previous
 * section — the chart titles and the summary table. Without them, whichever
 * section precedes the summary would swallow its heading and axis labels.
 *
 * Matched as prefixes rather than exact strings because their decoration varies:
 * "RESUMEN POR GRÁFICO (%)" normalises to "RESUMEN POR GRAFICO ()" once the
 * percent sign is stripped, and chart titles carry a trailing scale name.
 */
const SUMMARY_HEADING = "__RESUMEN__";
const CHART_HEADING = "__GRAFICA__";

// Prefixes, not exact strings: a real heading is only upper-case letters,
// digits and parentheses, so these sentinels can never collide with one.
const STRUCTURAL_HEADING_PATTERNS: { pattern: RegExp; heading: string }[] = [
  { pattern: /^RESUMEN POR GRAFICO\b/, heading: SUMMARY_HEADING },
  { pattern: /^GRAFICA \d+\b/, heading: CHART_HEADING },
];

function matchHeading(key: string): string | null {
  const exact = ALL_HEADINGS.find((heading) => heading === key);
  if (exact) return exact;
  return STRUCTURAL_HEADING_PATTERNS.find(({ pattern }) => pattern.test(key))?.heading ?? null;
}

/**
 * Page furniture. Every one of these repeats on each page and must never reach
 * the parsed output — dropping them is what stitches a section back together
 * across a page break.
 */
const NOISE_PATTERNS: RegExp[] = [
  /^PERSONAL COMPETENCES ANALYSIS$/,
  /^ANALISIS DE COMPETENCIAS PERSONALES$/,
  /^TIMS INTERNATIONAL$/,
  /^(PAGINA|PAGE) \d+( (DE|OF) \d+)?$/,
  /^\d{1,3}( ?\/ ?\d{1,3})?$/,
  /^NOMBRE\b.*$/,
  /^FECHA\b.*$/,
];

/**
 * Matched anywhere in the line rather than anchored, because the copyright
 * notice renders differently depending on how the PDF encodes "©" — it can
 * arrive as "©", as "(c)", or stripped away entirely. No real section body
 * contains this phrase, so a contains-match is safe.
 */
const NOISE_CONTAINS: RegExp[] = [/COPYRIGHT TIMS INTERNATIONAL/];

/**
 * Accent-, case- and punctuation-insensitive form used for *matching only*.
 * "CONDUCTAS OBSERVABLES (GRAFICA 3)" with or without the accent on GRAFICA
 * normalises to the same key.
 */
function normalizeKey(line: string): string {
  return line
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9()]+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function isNoise(normalized: string): boolean {
  return (
    NOISE_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    NOISE_CONTAINS.some((pattern) => pattern.test(normalized))
  );
}

/** A line of nothing but integers, e.g. "78 50 56 53". Never prose. */
function isNumericRow(raw: string): boolean {
  return /^\s*\d{1,3}(?:[\s,.]+\d{1,3})*\s*$/.test(raw) && /\d/.test(raw);
}

function numbersIn(raw: string): number[] {
  return (raw.match(/\d{1,3}/g) ?? []).map(Number);
}

type Line = { raw: string; key: string; heading: string | null };

/**
 * Splits into lines and tags each one. A heading that got wrapped by the PDF
 * layout is matched by also trying the current line joined with the next, and
 * the second line is then blanked so it is not mistaken for body text.
 */
function toLines(text: string): Line[] {
  const raw = text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[\t ]+/g, " ")
    .split(/[\n\f]/)
    .map((line) => line.trim());

  const lines: Line[] = raw.map((value) => ({
    raw: value,
    key: normalizeKey(value),
    heading: null,
  }));

  for (let i = 0; i < lines.length; i += 1) {
    const own = matchHeading(lines[i].key);
    if (own) {
      lines[i].heading = own;
      continue;
    }
    if (i + 1 < lines.length && lines[i].raw && lines[i + 1].raw) {
      const joined = normalizeKey(`${lines[i].raw} ${lines[i + 1].raw}`);
      // Only exact matches may consume a second line: a prefix match would
      // swallow the first line of body text sitting under a chart title.
      const wrapped = ALL_HEADINGS.find((heading) => heading === joined);
      if (wrapped) {
        lines[i].heading = wrapped;
        lines[i + 1] = { raw: "", key: "", heading: null };
      }
    }
  }

  return lines;
}

/** First "Nombre:" / "Fecha:" wins; later repeats are page furniture. */
function readLabelled(lines: Line[], label: string): string | null {
  const pattern = new RegExp(`^\\s*${label}\\s*[:.-]?\\s*(.*)$`, "i");

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].raw.match(pattern);
    if (!match) continue;

    const inline = match[1].trim();
    if (inline) return inline;

    // The label was alone on its line — the value wrapped onto the next one.
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j];
      if (!next.raw) continue;
      if (next.heading || isNoise(next.key)) break;
      return next.raw.trim();
    }
  }

  return null;
}

/**
 * The run of numbers belonging to a score heading. Reads numbers that sit on the
 * heading line itself, then any following numeric-only lines, stopping at the
 * first line of real text so a scale can never absorb the next section.
 */
function readScores(lines: Line[], heading: string): number[] | null {
  const start = lines.findIndex((line) => line.heading === heading);
  if (start === -1) return null;

  const values: number[] = [...numbersIn(lines[start].raw.replace(/[^\d\s]/g, " "))];

  for (let i = start + 1; i < lines.length && values.length < 4; i += 1) {
    const line = lines[i];
    if (!line.raw) continue;
    if (line.heading) break;
    if (isNoise(line.key)) continue;
    if (!isNumericRow(line.raw)) break;
    values.push(...numbersIn(line.raw));
  }

  return values.length > 0 ? values.slice(0, 4) : null;
}

/**
 * Body text between a heading and the next heading of any kind.
 * Page furniture and numeric rows are dropped; blank lines are kept as
 * paragraph breaks and everything else is rejoined onto single lines.
 */
function readSection(lines: Line[], heading: string): string | null {
  const start = lines.findIndex((line) => line.heading === heading);
  if (start === -1) return null;

  const paragraphs: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) {
      paragraphs.push(current.join(" ").replace(/\s+/g, " ").trim());
      current = [];
    }
  };

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.heading) break;
    if (!line.raw) {
      flush();
      continue;
    }
    if (isNoise(line.key)) continue;
    if (isNumericRow(line.raw)) continue;
    current.push(line.raw);
  }

  flush();

  const body = paragraphs.filter(Boolean).join("\n\n").trim();
  return body || null;
}

/**
 * The percentages under "RESUMEN POR GRÁFICO (%)", one per graph in order.
 *
 * Read as a plain run of numbers rather than by label, because the table is
 * rendered as a chart and pdf.js emits its cells with no reliable structure.
 */
function readGraphSummary(lines: Line[]): { 1: number | null; 2: number | null; 3: number | null } {
  const empty = { 1: null, 2: null, 3: null } as {
    1: number | null;
    2: number | null;
    3: number | null;
  };

  const start = lines.findIndex((line) => line.heading === SUMMARY_HEADING);
  if (start === -1) return empty;

  // The page-number noise rule cannot be applied here: it treats any lone 1-3
  // digit line as page furniture, which is exactly what this table's cells look
  // like. Instead the run is read as strictly contiguous — the first line that
  // is not numeric ends the table, footer included.
  const values: number[] = [];
  for (let i = start + 1; i < lines.length && values.length < 3; i += 1) {
    const line = lines[i];
    if (!line.raw) continue;
    if (line.heading) break;
    if (!isNumericRow(line.raw)) break;
    values.push(...numbersIn(line.raw));
  }

  return { 1: values[0] ?? null, 2: values[1] ?? null, 3: values[2] ?? null };
}

function zipByFactor(values: number[], factors: string[]): Record<string, number> | null {
  if (factors.length !== 4 || values.length !== 4) return null;
  return Object.fromEntries(factors.map((factor, i) => [factor, values[i]]));
}

/**
 * Parses the plain text of a PERSONAL COMPETENCES ANALYSIS report.
 *
 * Never throws on a malformed report: missing pieces come back as `null` and are
 * listed in `warnings`, so one odd PDF cannot take down a batch.
 */
export function parseCompetencesReport(text: string): CompetencesReport {
  const warnings: string[] = [];
  const lines = toLines(text ?? "");

  const full_name = readLabelled(lines, "Nombre");
  if (!full_name) warnings.push('No "Nombre:" line was found.');

  const report_date = readLabelled(lines, "Fecha");
  if (!report_date) warnings.push('No "Fecha:" line was found.');

  // Reported in the order the document lists them, not the order declared here.
  const knownFactors: string[] = [...MEASUREMENT_FACTORS];
  const factors = lines
    .map((line) => line.heading)
    .filter((heading): heading is string => heading !== null && knownFactors.includes(heading))
    .filter((heading, index, all) => all.indexOf(heading) === index);

  if (factors.length !== knownFactors.length) {
    warnings.push(
      `Expected ${knownFactors.length} measurement factors, found ${factors.length}.`,
    );
  }

  const scores = {} as CompetencesReport["scores"];
  for (const { key, heading } of SCORE_HEADINGS) {
    const values = readScores(lines, heading);
    if (values === null) {
      scores[key] = null;
      warnings.push(`Section "${heading}" is missing or has no scores.`);
      continue;
    }
    if (values.length !== 4) {
      warnings.push(`Section "${heading}" has ${values.length} scores, expected 4.`);
    }
    scores[key] = { values, byFactor: zipByFactor(values, factors) };
  }

  const sections = {} as CompetencesReport["sections"];
  for (const { key, heading } of SECTION_HEADINGS) {
    const body = readSection(lines, heading);
    sections[key] = body;
    if (!body) warnings.push(`Section "${heading}" is missing or empty.`);
  }

  const graphSummary = readGraphSummary(lines);
  const hasSummaryHeading = lines.some((line) => line.heading === SUMMARY_HEADING);
  if (hasSummaryHeading && graphSummary[1] === null) {
    warnings.push('"RESUMEN POR GRAFICO" was found but no percentages could be read from it.');
  }

  return { full_name, report_date, scores, factors, graphSummary, sections, warnings };
}
