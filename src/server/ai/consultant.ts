import "server-only";

import { getAdminSupabase } from "@/lib/supabase/admin";
import type { FactorScores } from "@/server/pdf/competences-report";
import { classifyDisc, describeDisc, DISC_TRAITS, GRAPH_LABELS } from "@/server/pdf/disc";

/**
 * Builds the profile context handed to Claude, and nothing else.
 *
 * The context is assembled **server-side from the database** using only the
 * profile id the browser sends. Nothing the client posts is trusted as profile
 * data — otherwise a caller could invent scores and have the model reason about
 * a person who does not exist.
 *
 * Only assessment content is included: no keys, no connection strings, no
 * storage paths, no internal row ids beyond the profile being discussed.
 */

export type ProfileContext = {
  profileId: string;
  fullName: string;
  /** Rendered prompt context. Contains report content only. */
  text: string;
  /** Short DISC line for the UI header. */
  discSummary: string | null;
};

type RawScores = {
  profileGraph?: number;
  graphs?: Record<string, FactorScores | null>;
} | null;

function renderGraph(label: string, scores: FactorScores | null): string {
  if (!scores) return `${label}: not reported`;
  return (
    `${label}: D=${scores.dominance} I=${scores.influence} ` +
    `S=${scores.steadiness} C=${scores.control}`
  );
}

function section(title: string, body: string | null): string {
  return body && body.trim() ? `\n## ${title}\n${body.trim()}\n` : "";
}

/**
 * Loads one profile and renders it as prompt context.
 *
 * Returns null when the profile does not exist, so the route can answer 404
 * without leaking whether an id is merely unauthorised.
 */
export async function buildProfileContext(profileId: string): Promise<ProfileContext | null> {
  const supabase = getAdminSupabase();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, position, department, summary")
    .eq("id", profileId)
    .maybeSingle();

  if (error) throw new Error(`Could not load the profile: ${error.message}`);
  if (!profile) return null;

  const [assessmentResult, capabilityResult, attitudeResult] = await Promise.all([
    supabase
      .from("profile_assessments")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("profile_capabilities").select("label").eq("profile_id", profileId).order("label"),
    supabase.from("profile_attitudes").select("label").eq("profile_id", profileId).order("label"),
  ]);

  const assessment = assessmentResult.data?.[0] ?? null;
  const capabilities = (capabilityResult.data ?? []).map((row) => row.label);
  const attitudes = (attitudeResult.data ?? []).map((row) => row.label);

  const parts: string[] = [];
  parts.push(`# Profile: ${profile.full_name}`);
  if (profile.position) parts.push(`Position: ${profile.position}`);
  if (profile.department) parts.push(`Department: ${profile.department}`);

  let discSummary: string | null = null;

  if (assessment) {
    if (assessment.report_date) parts.push(`Report date: ${assessment.report_date}`);

    const raw = assessment.raw_scores as RawScores;
    const graphs = raw?.graphs ?? null;
    const graph1 = graphs?.["1"] ?? null;

    parts.push("\n## Measured DISC scores (0-100, directly from the report)");
    parts.push(renderGraph(`Graph 1 — ${GRAPH_LABELS[1].en}`, graph1));
    parts.push(renderGraph(`Graph 2 — ${GRAPH_LABELS[2].en}`, graphs?.["2"] ?? null));
    parts.push(renderGraph(`Graph 3 — ${GRAPH_LABELS[3].en}`, graphs?.["3"] ?? null));

    if (graph1) {
      const disc = classifyDisc(graph1);
      discSummary = `${disc.combination} — ${disc.combinationNameEs}`;

      parts.push("\n## DISC classification (derived from Graph 1 by ranking the scores)");
      parts.push(describeDisc(disc, "en"));
      parts.push(
        `Primary: ${disc.primary.name} (${disc.primary.score}). ` +
          `Secondary: ${disc.secondary.name} (${disc.secondary.score}). ` +
          `Combination: ${disc.combination}.`,
      );
      parts.push(
        `Reference descriptors for ${disc.primary.name}: ` +
          `${DISC_TRAITS[disc.primary.letter].en.join(", ")}.`,
      );
      parts.push(
        `Reference descriptors for ${disc.secondary.name}: ` +
          `${DISC_TRAITS[disc.secondary.letter].en.join(", ")}.`,
      );
    }

    parts.push(section("Observable behaviour — Graph 1", assessment.conductas_observables_1));
    parts.push(section("Observable behaviour — Graph 2", assessment.conductas_observables_2));
    parts.push(section("Observable behaviour — Graph 3", assessment.conductas_observables_3));
    parts.push(section("Motivators", assessment.motivadores));
    parts.push(section("Ideal work environment", assessment.entorno_laboral_ideal));
    parts.push(section("Other comments", assessment.otros_comentarios));
  } else {
    parts.push("\nNo assessment report has been processed for this profile yet.");
  }

  if (profile.summary) parts.push(section("Summary on file", profile.summary));
  if (capabilities.length) parts.push(`\n## Competencies\n${capabilities.join(", ")}`);
  if (attitudes.length) parts.push(`\n## Attitudes\n${attitudes.join(", ")}`);

  return {
    profileId: profile.id,
    fullName: profile.full_name,
    text: parts.filter(Boolean).join("\n"),
    discSummary,
  };
}

/**
 * System prompt for the talent consultant.
 *
 * The three-way distinction between reported fact, score-derived reading, and
 * the model's own inference is the point of this prompt: an HR reader must be
 * able to tell which is which.
 */
export const CONSULTANT_SYSTEM_PROMPT = `You are a professional talent consultant assisting an HR team.

You answer questions about ONE candidate, using only the profile context provided in the user's first message. That context comes from a "PERSONAL COMPETENCES ANALYSIS" (DISC) report.

Always distinguish these three things clearly, and label them when it is not obvious:
1. Information taken directly from the report (scores, observable behaviour, motivators, ideal environment, comments).
2. Interpretation derived from the DISC scores (rankings, what a high or low factor commonly indicates).
3. Your own recommendations or inferences.

Rules:
- Never invent scores, dates, employment history, or facts that are not in the context. If something was not measured, say so plainly.
- DISC describes behavioural tendencies at work. It is not a medical or psychological diagnosis and not a measure of ability, intelligence, or worth. Never present it as one.
- Use cautious, professional wording — "based on the reported scores...", "this pattern often suggests..." — never "this person definitely is...".
- Graph 1 (Work Adaptation) is the working profile. Graph 2 is behaviour under pressure and Graph 3 is self-image; when they differ meaningfully from Graph 1, that contrast is worth pointing out.
- Do not give hiring, promotion, or termination verdicts. Offer considerations a human decision-maker can weigh.
- Answer in the language the user writes in. The team works in Spanish; default to Spanish.
- Be concise and well structured. Use short paragraphs or bullets, not walls of text.`;
