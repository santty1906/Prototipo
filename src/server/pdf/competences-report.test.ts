import { describe, expect, it } from "vitest";

import { GRAPH_SCALES, parseCompetencesReport } from "./competences-report";

/**
 * A fixture built from the REAL TIMS report's extracted text, not an idealised
 * one. Everything awkward about the real document is reproduced here:
 *
 *  - "Nombre:" and "Fecha:" share a single line
 *  - the header repeats on every page, with a copyright footer and page number
 *  - scores appear as lone 1-3 digit lines (which look exactly like page numbers)
 *  - the authoritative scores are a 4 x 3 matrix, one factor per row
 *  - the summary heading has footer text concatenated onto it with no space
 *  - "CONDUCTAS OBSERVABLES" sections do not appear in numerical order
 *  - one heading is wrapped across two lines by the PDF layout
 */
const REAL_SAMPLE = [
  "PERSONAL COMPETENCES ANALYSIS",
  "Nombre: Nicolás Gallo Aranda Fecha: 26/08/2026",
  "",
  "ADAPTACIÓN LABORAL",
  "78",
  "50",
  "18",
  "53",
  "Gráfica 1",
  "CONDUCTA BAJO PRESIÓN",
  "56",
  "75",
  "26",
  "50",
  "Gráfica 2",
  "IMAGEN PROPIA",
  "62 62",
  "25",
  "50",
  "Gráfica 3",
  "© Copyright TIMS International 2026",
  "1",
  "\f",
  "PERSONAL COMPETENCES ANALYSIS",
  "Nombre: Nicolás Gallo Aranda Fecha: 26/08/2026",
  "RESUMEN POR GRÁFICO (%)Personal Competences Analysis",
  "FACTORES DE",
  "MEDICIÓN ADAPTACIÓN LABORAL CONDUCTA BAJO",
  "PRESIÓN IMAGEN PROPIA",
  "DOMINANCIA 78 56 62",
  "INFLUENCIA 50 75 62",
  "SOLIDEZ 18 26 25",
  "CONTROL 53 50 50",
  "© Copyright TIMS International 2026",
  "2",
  "\f",
  "PERSONAL COMPETENCES ANALYSIS",
  "Nombre: Nicolás Gallo Aranda Fecha: 26/08/2026",
  "",
  "CONDUCTAS OBSERVABLES (GRÁFICA 3)",
  "Se muestra decidido ante los retos y mantiene",
  "un ritmo constante de trabajo.",
  "",
  "Prefiere entornos donde las reglas son claras.",
  "© Copyright TIMS International 2026",
  "3",
  "\f",
  "PERSONAL COMPETENCES ANALYSIS",
  "Nombre: Nicolás Gallo Aranda Fecha: 26/08/2026",
  "",
  "MOTIVADORES",
  "Le motiva el reconocimiento público y la",
  "posibilidad de influir en decisiones.",
  "",
  "ENTORNO LABORAL IDEAL",
  "Un equipo colaborativo con objetivos medibles.",
  "",
  "OTROS COMENTARIOS",
  "Conviene acompañarle en tareas de detalle.",
  "© Copyright TIMS International 2026",
  "4",
  "\f",
  "PERSONAL COMPETENCES ANALYSIS",
  "Nombre: Nicolás Gallo Aranda Fecha: 26/08/2026",
  "",
  // Heading wrapped by the PDF layout.
  "CONDUCTAS OBSERVABLES (GRÁFICA",
  "1)",
  "Responde bien a la presión del entorno.",
  "",
  "CONDUCTAS OBSERVABLES (GRÁFICA 2)",
  "Ajusta su conducta cuando el grupo lo requiere.",
  "© Copyright TIMS International 2026",
  "5",
].join("\n");

describe("parseCompetencesReport — real report structure", () => {
  const report = parseCompetencesReport(REAL_SAMPLE);

  it("separates the name from the date when both share one line", () => {
    expect(report.full_name).toBe("Nicolás Gallo Aranda");
    // Regression: the name used to swallow the date, which corrupted both the
    // profile name and identity matching.
    expect(report.full_name).not.toMatch(/Fecha/);
    expect(report.full_name).not.toMatch(/\d/);
  });

  it("normalises the report date to ISO", () => {
    expect(report.report_date).toBe("2026-08-26");
    expect(report.report_date_raw).toBe("26/08/2026");
  });

  it("reads the authoritative 4 x 3 matrix", () => {
    expect(report.matrix).toEqual({
      DOMINANCIA: [78, 56, 62],
      INFLUENCIA: [50, 75, 62],
      SOLIDEZ: [18, 26, 25],
      CONTROL: [53, 50, 50],
    });
  });

  it("pivots the matrix into Graph 1 scores", () => {
    expect(report.graphs[1]).toEqual({
      dominance: 78,
      influence: 50,
      steadiness: 18,
      control: 53,
    });
  });

  it("pivots the matrix into Graph 2 scores", () => {
    expect(report.graphs[2]).toEqual({
      dominance: 56,
      influence: 75,
      steadiness: 26,
      control: 50,
    });
  });

  it("pivots the matrix into Graph 3 scores", () => {
    expect(report.graphs[3]).toEqual({
      dominance: 62,
      influence: 62,
      steadiness: 25,
      control: 50,
    });
  });

  it("does not discard scores that look like page numbers", () => {
    // Regression: lone 1-3 digit lines were treated as page furniture, which
    // silently emptied every score column.
    expect(report.scores.adaptacion_laboral?.values).toEqual([78, 50, 18, 53]);
    expect(report.scores.conducta_bajo_presion?.values).toEqual([56, 75, 26, 50]);
    expect(report.scores.imagen_propia?.values).toEqual([62, 62, 25, 50]);
  });

  it("lists the four measurement factors", () => {
    expect(report.factors).toEqual(["DOMINANCIA", "INFLUENCIA", "SOLIDEZ", "CONTROL"]);
  });

  it("maps each graph number to its named scale", () => {
    expect(GRAPH_SCALES).toEqual({
      1: "adaptacion_laboral",
      2: "conducta_bajo_presion",
      3: "imagen_propia",
    });
  });

  it("maps each prose section to its own field regardless of document order", () => {
    expect(report.sections.conductas_observables_graph_1).toBe(
      "Responde bien a la presión del entorno.",
    );
    expect(report.sections.conductas_observables_graph_2).toBe(
      "Ajusta su conducta cuando el grupo lo requiere.",
    );
    expect(report.sections.conductas_observables_graph_3).toContain("Se muestra decidido");
  });

  it("rejoins wrapped lines and keeps paragraph breaks", () => {
    expect(report.sections.conductas_observables_graph_3).toBe(
      "Se muestra decidido ante los retos y mantiene un ritmo constante de trabajo." +
        "\n\n" +
        "Prefiere entornos donde las reglas son claras.",
    );
  });

  it("does not let a section absorb the next section's text", () => {
    expect(report.sections.motivadores).toBe(
      "Le motiva el reconocimiento público y la posibilidad de influir en decisiones.",
    );
    expect(report.sections.motivadores).not.toContain("ENTORNO");
    expect(report.sections.entorno_laboral_ideal).toBe(
      "Un equipo colaborativo con objetivos medibles.",
    );
    expect(report.sections.otros_comentarios).toBe("Conviene acompañarle en tareas de detalle.");
  });

  it("strips repeated headers, copyright footers and page numbers from the prose", () => {
    for (const body of Object.values(report.sections)) {
      expect(body).not.toMatch(/PERSONAL COMPETENCES ANALYSIS|Copyright|Nombre:|Fecha:/);
      expect(body).not.toMatch(/^\d+$/m);
    }
  });

  it("parses the real report with no warnings", () => {
    expect(report.warnings).toEqual([]);
  });
});

describe("parseCompetencesReport — robustness", () => {
  it("still reads a report where the labels are on separate lines", () => {
    const parsed = parseCompetencesReport(
      ["Nombre: Ana Ramírez", "Fecha: 01/12/2025", "MOTIVADORES", "Texto."].join("\n"),
    );
    expect(parsed.full_name).toBe("Ana Ramírez");
    expect(parsed.report_date).toBe("2025-12-01");
  });

  it("rejects an impossible date rather than rolling it forward", () => {
    const parsed = parseCompetencesReport("Nombre: X Fecha: 31/02/2026");
    expect(parsed.report_date).toBeNull();
    expect(parsed.report_date_raw).toBe("31/02/2026");
    expect(parsed.warnings.join(" ")).toContain("31/02/2026");
  });

  it("returns a null matrix and warns when the table is absent", () => {
    const parsed = parseCompetencesReport("Nombre: X Fecha: 01/01/2026\nMOTIVADORES\nTexto.");
    expect(parsed.matrix).toBeNull();
    expect(parsed.graphs).toEqual({ 1: null, 2: null, 3: null });
    expect(parsed.warnings.join(" ")).toContain("4x3 factor matrix");
  });

  it("ignores a factor name that appears inside prose", () => {
    const parsed = parseCompetencesReport(
      ["MOTIVADORES", "Muestra DOMINANCIA en las reuniones de equipo."].join("\n"),
    );
    expect(parsed.matrix).toBeNull();
  });

  it("degrades instead of throwing on unrelated text", () => {
    const empty = parseCompetencesReport("Just an ordinary CV, nothing to see.");
    expect(empty.full_name).toBeNull();
    expect(empty.graphs[1]).toBeNull();
    expect(empty.sections.motivadores).toBeNull();
    expect(empty.warnings.length).toBeGreaterThan(0);
  });

  it("survives an empty string", () => {
    expect(() => parseCompetencesReport("")).not.toThrow();
  });

  // Regression: a PDF that encodes "©" as "(c)" used to leak the footer into the
  // last section on the page, because the noise rule was anchored too tightly.
  it.each(["© Copyright TIMS International 2026", "(c) Copyright TIMS International 2026"])(
    "strips the copyright footer rendered as %s",
    (footer) => {
      const parsed = parseCompetencesReport(
        ["MOTIVADORES", "Le motiva el reconocimiento.", footer, "7"].join("\n"),
      );
      expect(parsed.sections.motivadores).toBe("Le motiva el reconocimiento.");
    },
  );
});
