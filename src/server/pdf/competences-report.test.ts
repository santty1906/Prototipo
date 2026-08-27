import { describe, expect, it } from "vitest";

import { GRAPH_SCALES, parseCompetencesReport } from "./competences-report";

/**
 * A report as pdf.js actually renders it: the title, "Nombre:" and "Fecha:"
 * repeat on every page, each page ends with a copyright line and a page number,
 * one heading is wrapped across two lines, and the sections do not appear in
 * numerical order. All of that has to survive parsing.
 */
const SAMPLE = [
  "PERSONAL COMPETENCES ANALYSIS",
  "",
  "Nombre: Nicolás Gallo Aranda",
  "Fecha: 26/08/2026",
  "",
  "ADAPTACIÓN LABORAL",
  "78 50 56 53",
  "",
  "CONDUCTA BAJO PRESIÓN",
  "75 26 50 62",
  "",
  "IMAGEN PROPIA",
  "62 62 25 50",
  "",
  "FACTORES DE MEDICIÓN",
  "DOMINANCIA",
  "INFLUENCIA",
  "SOLIDEZ",
  "CONTROL",
  "",
  "RESUMEN POR GRÁFICO (%)",
  "59",
  "53",
  "50",
  "© Copyright TIMS International 2026",
  "1",
  "\f",
  "PERSONAL COMPETENCES ANALYSIS",
  "Nombre: Nicolás Gallo Aranda",
  "Fecha: 26/08/2026",
  "",
  "CONDUCTAS OBSERVABLES (GRÁFICA 3)",
  "Se muestra decidido ante los retos y mantiene",
  "un ritmo constante de trabajo.",
  "",
  "Prefiere entornos donde las reglas son claras.",
  "© Copyright TIMS International 2026",
  "2",
  "\f",
  "PERSONAL COMPETENCES ANALYSIS",
  "Nombre: Nicolás Gallo Aranda",
  "Fecha: 26/08/2026",
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
  "3",
  "\f",
  "PERSONAL COMPETENCES ANALYSIS",
  "Nombre: Nicolás Gallo Aranda",
  "Fecha: 26/08/2026",
  "",
  // Heading wrapped by the PDF layout.
  "CONDUCTAS OBSERVABLES (GRÁFICA",
  "1)",
  "Responde bien a la presión del entorno.",
  "",
  "CONDUCTAS OBSERVABLES (GRÁFICA 2)",
  "Ajusta su conducta cuando el grupo lo requiere.",
  "© Copyright TIMS International 2026",
  "4",
].join("\n");

describe("parseCompetencesReport", () => {
  const report = parseCompetencesReport(SAMPLE);

  it("reads the candidate name once, ignoring the repeats on later pages", () => {
    expect(report.full_name).toBe("Nicolás Gallo Aranda");
  });

  it("reads the report date", () => {
    expect(report.report_date).toBe("26/08/2026");
  });

  it("reads all three score rows as numbers, not prose", () => {
    expect(report.scores.adaptacion_laboral?.values).toEqual([78, 50, 56, 53]);
    expect(report.scores.conducta_bajo_presion?.values).toEqual([75, 26, 50, 62]);
    expect(report.scores.imagen_propia?.values).toEqual([62, 62, 25, 50]);
  });

  it("keys the scores by measurement factor", () => {
    expect(report.scores.adaptacion_laboral?.byFactor).toEqual({
      DOMINANCIA: 78,
      INFLUENCIA: 50,
      SOLIDEZ: 56,
      CONTROL: 53,
    });
  });

  it("finds the four measurement factors in document order", () => {
    expect(report.factors).toEqual(["DOMINANCIA", "INFLUENCIA", "SOLIDEZ", "CONTROL"]);
  });

  it("maps each graph section to its own field regardless of document order", () => {
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
    expect(report.sections.otros_comentarios).toBe(
      "Conviene acompañarle en tareas de detalle.",
    );
  });

  it("strips page furniture out of the prose", () => {
    for (const body of Object.values(report.sections)) {
      expect(body).not.toMatch(/PERSONAL COMPETENCES ANALYSIS|Copyright|Nombre:|Fecha:/);
      expect(body).not.toMatch(/^\d+$/m);
    }
  });

  it("reports no warnings for a well-formed report", () => {
    expect(report.warnings).toEqual([]);
  });

  it("reads one percentage per graph from RESUMEN POR GRÁFICO (%)", () => {
    expect(report.graphSummary).toEqual({ 1: 59, 2: 53, 3: 50 });
  });

  it("treats the summary table and chart titles as section boundaries", () => {
    // Regression: RESUMEN POR GRÁFICO was not a known heading, so the section
    // before it absorbed the table's title.
    const parsed = parseCompetencesReport(
      [
        "OTROS COMENTARIOS",
        "Un comentario final.",
        "RESUMEN POR GRÁFICO (%)",
        "59",
        "53",
        "50",
        "GRÁFICA 1: ADAPTACIÓN LABORAL",
        "78 50 56 53",
      ].join("\n"),
    );

    expect(parsed.sections.otros_comentarios).toBe("Un comentario final.");
    expect(parsed.sections.otros_comentarios).not.toMatch(/RESUMEN|GR[ÁA]FICA/);
    expect(parsed.graphSummary[1]).toBe(59);
  });

  it("maps each graph number to its named scale", () => {
    expect(GRAPH_SCALES).toEqual({
      1: "adaptacion_laboral",
      2: "conducta_bajo_presion",
      3: "imagen_propia",
    });
  });

  it("degrades instead of throwing on unrelated text", () => {
    const empty = parseCompetencesReport("Just an ordinary CV, nothing to see.");
    expect(empty.full_name).toBeNull();
    expect(empty.scores.imagen_propia).toBeNull();
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
