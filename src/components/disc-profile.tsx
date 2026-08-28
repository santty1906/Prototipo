import { Card } from "@/components/ui";
import type { FactorScores, GraphScores } from "@/server/pdf/competences-report";
import {
  classifyDisc,
  describeCombination,
  DISC_COMBINATION_NOTE_ES,
  DISC_DIMENSIONS,
  DISC_TIE_NOTE_ES,
  DISC_TRAITS,
  GRAPH_LABELS,
  hasTie,
  topLettersLabel,
  type DiscLetter,
} from "@/server/pdf/disc";

/**
 * DISC presentation for the profile detail page.
 *
 * All classification comes from `@/server/pdf/disc` — this file only renders.
 * Every number shown is a stored 0-100 report score; nothing is normalised,
 * rescaled, or hardcoded.
 */

/** One labelled 0-100 bar. The width is the score, not a share of a total. */
function ScoreBar({
  letter,
  label,
  score,
  emphasised = false,
}: {
  letter: DiscLetter;
  label: string;
  score: number;
  emphasised?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-5 shrink-0 text-sm font-semibold tabular-nums">{letter}</span>
      <span className="w-32 shrink-0 truncate text-sm text-slate-600 sm:w-40">{label}</span>
      <div
        className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`${label}: ${score} sobre 100`}
      >
        <div
          className={`h-full rounded-full ${emphasised ? "bg-slate-900" : "bg-slate-400"}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-11 shrink-0 text-right text-sm font-medium tabular-nums">{score}%</span>
    </div>
  );
}

function ScoreBars({ scores, emphasise }: { scores: FactorScores; emphasise?: DiscLetter[] }) {
  const rows: { letter: DiscLetter; score: number }[] = [
    { letter: "D", score: scores.dominance },
    { letter: "I", score: scores.influence },
    { letter: "S", score: scores.steadiness },
    { letter: "C", score: scores.control },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <ScoreBar
          key={row.letter}
          letter={row.letter}
          label={DISC_DIMENSIONS[row.letter].labelEs}
          score={row.score}
          emphasised={emphasise ? emphasise.includes(row.letter) : true}
        />
      ))}
    </div>
  );
}

export function DiscProfilePanel({ graphs }: { graphs: GraphScores }) {
  const graph1 = graphs[1];
  if (!graph1) return null;

  const disc = classifyDisc(graph1);
  const tied = hasTie(disc);
  const topTwo = disc.ranked.slice(0, 2);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-slate-600">Clasificación DISC</h2>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{disc.combination}</p>
            <p className="text-slate-600">{disc.combinationNameEs}</p>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
              {DISC_COMBINATION_NOTE_ES}
            </p>
            {tied ? (
              <p className="mt-1.5 max-w-md rounded-md bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-900">
                {DISC_TIE_NOTE_ES}
              </p>
            ) : null}
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            Gráfica 1 — {GRAPH_LABELS[1].es}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Perfil predominante</p>
            <p className="mt-0.5 font-medium">
              {disc.primary.letter} — {disc.primary.labelEs}
            </p>
            <p className="text-sm text-slate-600 tabular-nums">{disc.primary.score}%</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Perfil secundario</p>
            <p className="mt-0.5 font-medium">
              {disc.secondary.letter} — {disc.secondary.labelEs}
            </p>
            <p className="text-sm text-slate-600 tabular-nums">{disc.secondary.score}%</p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-700">{describeCombination(disc)}</p>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          DISC describe tendencias de comportamiento en el trabajo a partir de las puntuaciones
          del informe. No es un diagnóstico médico ni psicológico, ni una medida de capacidad.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-600">Puntuación DISC</h2>
          <span className="text-xs text-slate-500">
            Nivel relativo según la prueba (escala 0–100)
          </span>
        </div>

        <div className="mt-4">
          <ScoreBars scores={graph1} />
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Cada valor es la puntuación de esa dimensión en la escala 0–100 del informe. No suman
          100% ni representan una probabilidad.
        </p>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-medium text-slate-600">Letras DISC más sobresalientes</h3>
          <ul className="mt-2 space-y-1.5">
            {topTwo.map((factor) => (
              <li key={factor.letter} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold">{factor.letter}</span>
                <span className="tabular-nums text-slate-600">{factor.score}%</span>
                <span className="text-slate-600">— {factor.labelEs}</span>
              </li>
            ))}
          </ul>
          <p
            className={`mt-3 rounded-md px-3 py-2 text-sm ${
              tied ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700"
            }`}
          >
            {topLettersLabel(disc)}
            {tied ? ". No se asigna una letra dominante cuando las puntuaciones coinciden." : ""}
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-medium text-slate-600">Comparación por gráfica</h2>
        <p className="mt-1 text-xs text-slate-500">
          La Gráfica 1 se usa para la clasificación DISC principal.
        </p>

        <div className="mt-4 space-y-5">
          {([1, 2, 3] as const).map((n) => {
            const scores = graphs[n];
            const isPrimary = n === 1;

            return (
              <div
                key={n}
                className={
                  isPrimary
                    ? "rounded-md border-2 border-slate-900 p-4"
                    : "rounded-md border border-slate-200 p-4"
                }
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">
                    {n}. {GRAPH_LABELS[n].es}
                  </h3>
                  {isPrimary ? (
                    <span className="rounded bg-slate-900 px-2 py-0.5 text-xs text-white">
                      perfil base
                    </span>
                  ) : null}
                </div>

                {scores ? (
                  <ScoreBars scores={scores} emphasise={isPrimary ? undefined : []} />
                ) : (
                  <p className="text-sm text-slate-500">Sin datos en el informe.</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-medium text-slate-600">Qué mide cada dimensión</h2>
        <dl className="mt-3 space-y-3">
          {(Object.keys(DISC_DIMENSIONS) as DiscLetter[]).map((letter) => (
            <div key={letter}>
              <dt className="text-sm font-medium">
                {letter} — {DISC_DIMENSIONS[letter].labelEs}
              </dt>
              <dd className="text-sm text-slate-600">{DISC_DIMENSIONS[letter].descriptionEs}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <TraitList letter={disc.primary.letter} label={disc.primary.labelEs} role="predominante" />
          <TraitList
            letter={disc.secondary.letter}
            label={disc.secondary.labelEs}
            role="secundario"
          />
        </div>
      </Card>
    </div>
  );
}

function TraitList({
  letter,
  label,
  role,
}: {
  letter: DiscLetter;
  label: string;
  role: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">
        {label} <span className="font-normal text-slate-500">({role})</span>
      </h3>
      <ul className="mt-1.5 space-y-0.5 text-sm text-slate-600">
        {DISC_TRAITS[letter].es.map((trait) => (
          <li key={trait}>· {trait}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Compact DISC summary for a list card: the classification and all four scores.
 *
 * Shows every dimension, not just the top two, so a card can be read on its own
 * — the two letters only mean something next to the numbers they came from.
 */
export function DiscCardSummary({ graph1 }: { graph1: FactorScores | null }) {
  if (!graph1) {
    return <p className="text-sm text-slate-500">Sin evaluación DISC procesada.</p>;
  }

  const disc = classifyDisc(graph1);
  const tied = hasTie(disc);
  const topTwo = [disc.primary.letter, disc.secondary.letter];

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs text-slate-500">Clasificación DISC</span>
        <span className="text-lg font-semibold tracking-tight">{disc.combination}</span>
        <span className="text-sm text-slate-600">{disc.combinationNameEs}</span>
      </div>

      <div className="mt-2 max-w-sm space-y-1.5">
        {(["D", "I", "S", "C"] as DiscLetter[]).map((letter) => {
          const factor = disc.ranked.find((entry) => entry.letter === letter)!;
          const emphasised = topTwo.includes(letter);

          return (
            <div key={letter} className="flex items-center gap-2">
              <span
                className={`w-4 shrink-0 text-xs ${emphasised ? "font-semibold" : "text-slate-500"}`}
              >
                {letter}
              </span>
              <div
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={`${factor.labelEs}: ${factor.score} sobre 100`}
              >
                <div
                  className={`h-full rounded-full ${emphasised ? "bg-slate-900" : "bg-slate-300"}`}
                  style={{ width: `${factor.score}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-600">
                {factor.score}%
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">{DISC_COMBINATION_NOTE_ES}</p>

      {tied ? (
        <p className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-900">
          {DISC_TIE_NOTE_ES}
        </p>
      ) : null}
    </div>
  );
}
