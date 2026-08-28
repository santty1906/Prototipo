import "server-only";

import { UPLOAD } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type {
  DocumentRow,
  Profile,
  ProfileAssessment,
  Trait,
} from "@/lib/supabase/database.types";
import type { FactorScores, GraphScores } from "@/server/pdf/competences-report";
import { discCombinationOf, type DiscCombination } from "@/server/pdf/disc";
import { traitLabelEs } from "@/server/pdf/traits";

export type TraitOption = { code: string; label: string };

export type ProfileListItem = Profile & {
  capabilities: TraitOption[];
  attitudes: TraitOption[];
  /** Graph 1 (Adaptación Laboral) scores, so the card can show DISC at a glance. */
  graph1: FactorScores | null;
};

export type ProfileFilters = {
  q?: string;
  capabilities?: string[];
  attitudes?: string[];
  /**
   * DISC combinations to keep, e.g. ["DI", "CS"].
   *
   * OR within the list — a candidate matches if their classification is any one
   * of them — and AND against the other filters, like every filter here.
   */
  disc?: DiscCombination[];
};

const PAGE_SIZE = 50;

/**
 * Prepares a typed name for matching against `profiles.full_name_normalized`.
 *
 * Two things happen here. PostgREST reads `%`, `_`, `,` and parentheses as
 * filter syntax, so those are stripped. And the term is lower-cased and
 * accent-stripped to mirror the generated column, which is what lets "Ramirez"
 * find "Ramírez" while "Ramírez" still finds itself — Postgres `ILIKE` folds
 * case but not accents, so the folding has to happen on both sides.
 */
function sanitizeSearch(q: string) {
  return q
    .replace(/[%_,().*"]/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Profile ids that carry *every* one of `codes` (AND, not OR — picking two
 * capabilities should narrow the list, not widen it).
 *
 * Returns `null` when no codes were requested, meaning "no constraint".
 */
async function profileIdsWithAllTraits(
  table: "profile_capabilities" | "profile_attitudes",
  codes: string[],
): Promise<string[] | null> {
  if (codes.length === 0) return null;

  const { data, error } = await getAdminSupabase()
    .from(table)
    .select("profile_id, code")
    .in("code", codes);

  if (error) throw new Error(`No se pudo aplicar el filtro de ${table}: ${error.message}`);

  const matchedPerProfile = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const set = matchedPerProfile.get(row.profile_id) ?? new Set<string>();
    set.add(row.code);
    matchedPerProfile.set(row.profile_id, set);
  }

  return [...matchedPerProfile]
    .filter(([, matched]) => matched.size === codes.length)
    .map(([profileId]) => profileId);
}

/**
 * Profile ids whose DISC classification is one of `combinations` (OR).
 *
 * Server-side on purpose. The classification is derived, not stored, so it
 * cannot be expressed as a PostgREST predicate — but it still has to narrow the
 * set *before* the page limit is applied, or a candidate on page two would
 * simply never appear. Deriving it here keeps the filter and the profile card
 * reading the same numbers through the same function.
 *
 * Returns `null` when nothing was requested, meaning "no constraint". A profile
 * with no processed assessment has no classification and so matches nothing.
 */
async function profileIdsWithDiscCombination(
  combinations: DiscCombination[],
): Promise<string[] | null> {
  if (combinations.length === 0) return null;

  const wanted = new Set<string>(combinations);
  const graph1ByProfile = await graph1ScoresByProfile(null);

  const ids: string[] = [];
  for (const [profileId, scores] of graph1ByProfile) {
    if (wanted.has(discCombinationOf(scores))) ids.push(profileId);
  }

  return ids;
}

function intersect(a: string[] | null, b: string[] | null) {
  if (a === null) return b;
  if (b === null) return a;
  const inB = new Set(b);
  return a.filter((id) => inB.has(id));
}

/** Traits for a set of profiles, grouped by profile id. */
async function traitsByProfile(
  table: "profile_capabilities" | "profile_attitudes",
  profileIds: string[],
) {
  const grouped = new Map<string, TraitOption[]>();
  if (profileIds.length === 0) return grouped;

  const { data, error } = await getAdminSupabase()
    .from(table)
    .select("profile_id, code, label")
    .in("profile_id", profileIds)
    .order("label");

  if (error) throw new Error(`No se pudieron cargar los datos de ${table}: ${error.message}`);

  for (const row of data ?? []) {
    const list = grouped.get(row.profile_id) ?? [];
    list.push({ code: row.code, label: traitLabelEs(row.code, row.label) });
    grouped.set(row.profile_id, list);
  }

  return grouped;
}

export async function listProfiles(filters: ProfileFilters = {}): Promise<ProfileListItem[]> {
  const capabilityCodes = filters.capabilities ?? [];
  const attitudeCodes = filters.attitudes ?? [];
  const discCombinations = filters.disc ?? [];

  // Each filter contributes a set of ids, or `null` for "not applied". They are
  // intersected, so filters narrow together rather than competing.
  const allowedIds = intersect(
    intersect(
      await profileIdsWithAllTraits("profile_capabilities", capabilityCodes),
      await profileIdsWithAllTraits("profile_attitudes", attitudeCodes),
    ),
    await profileIdsWithDiscCombination(discCombinations),
  );

  // A filter was applied and nothing matched — skip the second round trip.
  if (allowedIds !== null && allowedIds.length === 0) return [];

  let query = getAdminSupabase()
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const search = sanitizeSearch(filters.q ?? "");
  // Matched against the generated, accent-free column, which carries its own
  // trigram index — a plain `like` suffices since both sides are lower-cased.
  if (search) query = query.like("full_name_normalized", `%${search}%`);
  if (allowedIds !== null) query = query.in("id", allowedIds);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron cargar los perfiles: ${error.message}`);

  const profiles = data ?? [];
  const ids = profiles.map((p) => p.id);
  const [capabilities, attitudes, graph1ByProfile] = await Promise.all([
    traitsByProfile("profile_capabilities", ids),
    traitsByProfile("profile_attitudes", ids),
    graph1ScoresByProfile(ids),
  ]);

  return profiles.map((profile) => ({
    ...profile,
    capabilities: capabilities.get(profile.id) ?? [],
    attitudes: attitudes.get(profile.id) ?? [],
    graph1: graph1ByProfile.get(profile.id) ?? null,
  }));
}

/** Reads `raw_scores.graphs[1]` out of jsonb. Never invents values. */
function readGraph1(rawScores: unknown): FactorScores | null {
  const raw = rawScores as { graphs?: Partial<GraphScores> } | null;
  return raw?.graphs?.[1] ?? null;
}

/**
 * Graph 1 scores per profile, taken from each profile's newest assessment.
 *
 * One extra query for the whole page rather than one per card. Pass `null` for
 * every profile — that is what the DISC filter needs, since it has to know the
 * classification of candidates it has not selected yet.
 */
async function graph1ScoresByProfile(profileIds: string[] | null) {
  const byProfile = new Map<string, FactorScores>();
  if (profileIds !== null && profileIds.length === 0) return byProfile;

  let query = getAdminSupabase()
    .from("profile_assessments")
    .select("profile_id, raw_scores, created_at")
    .order("created_at", { ascending: false });

  if (profileIds !== null) query = query.in("profile_id", profileIds);

  const { data, error } = await query;

  if (error) throw new Error(`No se pudieron cargar las evaluaciones: ${error.message}`);

  for (const row of data ?? []) {
    // Ordered newest-first, so the first row seen per profile is the current one.
    if (byProfile.has(row.profile_id)) continue;
    const graph1 = readGraph1(row.raw_scores);
    if (graph1) byProfile.set(row.profile_id, graph1);
  }

  return byProfile;
}

export type ProfileDetail = Profile & {
  capabilities: TraitOption[];
  attitudes: TraitOption[];
  documents: DocumentRow[];
  /** Most recent processed report, or null if none has been processed. */
  assessment: ProfileAssessment | null;
  /** The 4x3 matrix pivoted per graph, read back from the assessment. */
  graphs: GraphScores;
};

export async function getProfile(id: string): Promise<ProfileDetail | null> {
  const supabase = getAdminSupabase();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el perfil: ${error.message}`);
  if (!profile) return null;

  const [capabilities, attitudes, documents, assessments] = await Promise.all([
    supabase.from("profile_capabilities").select("*").eq("profile_id", id).order("label"),
    supabase.from("profile_attitudes").select("*").eq("profile_id", id).order("label"),
    supabase
      .from("documents")
      .select("*")
      .eq("profile_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profile_assessments")
      .select("*")
      .eq("profile_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const toOptions = (rows: Trait[] | null) =>
    (rows ?? []).map(({ code, label }) => ({ code, label: traitLabelEs(code, label) }));

  const assessment = assessments.data?.[0] ?? null;

  // raw_scores is jsonb, so it arrives untyped. Read the pivoted graphs back out
  // defensively — an assessment written before this shape existed has none.
  const rawGraphs = (assessment?.raw_scores as { graphs?: Partial<GraphScores> } | null)?.graphs;
  const graphs: GraphScores = {
    1: rawGraphs?.[1] ?? null,
    2: rawGraphs?.[2] ?? null,
    3: rawGraphs?.[3] ?? null,
  };

  return {
    ...profile,
    capabilities: toOptions(capabilities.data),
    attitudes: toOptions(attitudes.data),
    documents: documents.data ?? [],
    assessment,
    graphs,
  };
}

/**
 * Every distinct capability / attitude in use, for the filter checkboxes.
 *
 * Deduped in JS: PostgREST has no DISTINCT, and at MVP volume one small scan is
 * cheaper than the view or RPC it would take to avoid it.
 */
export async function listTraitOptions() {
  const supabase = getAdminSupabase();

  const [capabilities, attitudes] = await Promise.all([
    supabase.from("profile_capabilities").select("code, label").order("label"),
    supabase.from("profile_attitudes").select("code, label").order("label"),
  ]);

  const dedupe = (rows: { code: string; label: string }[] | null): TraitOption[] => {
    const byCode = new Map<string, string>();
    for (const row of rows ?? []) byCode.set(row.code, traitLabelEs(row.code, row.label));
    return [...byCode]
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  };

  return {
    capabilities: dedupe(capabilities.data),
    attitudes: dedupe(attitudes.data),
  };
}

export type NewProfileInput = {
  full_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  education: string | null;
  experience_years: number | null;
  summary: string | null;
  capabilities: TraitOption[];
  attitudes: TraitOption[];
};

export async function createProfile(input: NewProfileInput) {
  const supabase = getAdminSupabase();
  const { capabilities, attitudes, ...profile } = input;

  const { data, error } = await supabase
    .from("profiles")
    .insert(profile)
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo crear el perfil: ${error.message}`);

  const traitRows = (traits: TraitOption[]) =>
    traits.map((trait) => ({ profile_id: data.id, ...trait }));

  if (capabilities.length > 0) {
    const { error: capError } = await supabase
      .from("profile_capabilities")
      .insert(traitRows(capabilities));
    if (capError) throw new Error(`No se pudieron guardar las competencias: ${capError.message}`);
  }

  if (attitudes.length > 0) {
    const { error: attError } = await supabase
      .from("profile_attitudes")
      .insert(traitRows(attitudes));
    if (attError) throw new Error(`No se pudieron guardar las actitudes: ${attError.message}`);
  }

  return data.id;
}

export type UpdateProfileInput = {
  full_name: string;
  position: string | null;
  department: string | null;
  education: string | null;
  experience_years: number | null;
};

/**
 * Updates one profile's editable fields.
 *
 * Only the fields on the edit form are written, so nothing else on the row —
 * `email`, `phone`, `summary`, or anything the PDF pipeline populated — is
 * touched. `full_name_normalized` is a generated column and updates itself,
 * which keeps search and identity matching consistent after a rename.
 *
 * This is an UPDATE on an existing id: it can never create a second profile.
 */
export async function updateProfile(id: string, input: UpdateProfileInput) {
  const { data, error } = await getAdminSupabase()
    .from("profiles")
    .update(input)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`No se pudo actualizar el perfil: ${error.message}`);
  if (!data) throw new Error("Candidato no encontrado.");

  return data.id;
}

export type DeletedProfileSummary = {
  documentsDeleted: number;
  storageObjectsDeleted: number;
};

/**
 * Deletes a candidate and everything that belongs to them.
 *
 * The foreign keys do most of the work — `profile_capabilities`,
 * `profile_attitudes` and `profile_assessments` all cascade from `profiles`.
 *
 * Two things do NOT cascade and are handled explicitly here:
 *
 *  1. `documents.profile_id` is ON DELETE SET NULL, so the rows would survive as
 *     unassigned records pointing at a candidate who no longer exists.
 *  2. Deleting a `documents` row does not remove the PDF from Storage, so the
 *     candidate's report would remain in the private bucket indefinitely.
 *
 * Storage objects are removed first: an orphaned database row is recoverable and
 * visible, whereas a file left behind after the row is gone is neither.
 */
export async function deleteProfile(id: string): Promise<DeletedProfileSummary> {
  const supabase = getAdminSupabase();

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("profile_id", id);

  if (documentsError) {
    throw new Error(`No se pudieron cargar los documentos del candidato: ${documentsError.message}`);
  }

  const paths = (documents ?? []).map((document) => document.storage_path);
  let storageObjectsDeleted = 0;

  if (paths.length > 0) {
    const { data: removed, error: storageError } = await supabase.storage
      .from(UPLOAD.bucket)
      .remove(paths);

    if (storageError) {
      throw new Error(`No se pudieron eliminar los archivos almacenados: ${storageError.message}`);
    }
    storageObjectsDeleted = removed?.length ?? 0;

    // Cascades to profile_assessments via documents.document_id.
    const { error: deleteDocumentsError } = await supabase
      .from("documents")
      .delete()
      .eq("profile_id", id);

    if (deleteDocumentsError) {
      throw new Error(`No se pudieron eliminar los documentos: ${deleteDocumentsError.message}`);
    }
  }

  // Cascades to capabilities, attitudes and any remaining assessments.
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar el candidato: ${error.message}`);

  return { documentsDeleted: paths.length, storageObjectsDeleted };
}
