import "server-only";

import { UPLOAD } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { DocumentRow, ProcessingStatus } from "@/lib/supabase/database.types";
import {
  parseCompetencesReport,
  type CompetencesReport,
} from "@/server/pdf/competences-report";
import { classifyDisc, type DiscProfile } from "@/server/pdf/disc";
import { extractPdfText } from "@/server/pdf/extract-text";
import { extractTraits, type Trait } from "@/server/pdf/traits";

/** A document row plus the name of the profile it belongs to, if any. */
export type DocumentWithProfile = DocumentRow & {
  profile: { id: string; full_name: string } | null;
};

export async function listDocuments(limit = 25): Promise<DocumentWithProfile[]> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`No se pudieron cargar los documentos: ${error.message}`);

  const documents = data ?? [];
  const profileIds = [...new Set(documents.map((d) => d.profile_id).filter((id) => id !== null))];
  const names = new Map<string, string>();

  if (profileIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);

    if (profileError) throw new Error(`No se pudieron cargar los nombres de los perfiles: ${profileError.message}`);
    for (const profile of profiles ?? []) names.set(profile.id, profile.full_name);
  }

  return documents.map((document) => ({
    ...document,
    profile:
      document.profile_id && names.has(document.profile_id)
        ? { id: document.profile_id, full_name: names.get(document.profile_id)! }
        : null,
  }));
}

export async function countDocumentsByStatus() {
  const { data, error } = await getAdminSupabase()
    .from("documents")
    .select("processing_status");

  if (error) throw new Error(`No se pudieron contar los documentos: ${error.message}`);

  const counts: Record<ProcessingStatus, number> = {
    UPLOADING: 0,
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
  };
  for (const row of data ?? []) counts[row.processing_status] += 1;

  return { total: (data ?? []).length, counts };
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * Step 1 of an upload: reserve a document row and mint a one-shot upload URL.
 *
 * The bytes go from the browser straight to Supabase Storage rather than
 * through this server — a serverless request body cannot hold a 25 MB PDF, and
 * proxying them would buy nothing.
 *
 * The row exists before the bytes do, in state UPLOADING, so a browser that
 * closes mid-transfer leaves a visible stuck row instead of a silent gap.
 */
export async function createUploadTicket(input: {
  fileName: string;
  fileSize: number;
  mimeType: string;
  profileId: string | null;
}) {
  if (input.mimeType !== UPLOAD.mimeType) {
    throw new UploadError("Solo se aceptan archivos PDF.");
  }
  if (input.fileSize <= 0 || input.fileSize > UPLOAD.maxBytes) {
    throw new UploadError(
      `"${input.fileName}" supera el límite de ${UPLOAD.maxBytes / 1024 / 1024} MB.`,
    );
  }

  const supabase = getAdminSupabase();
  const documentId = crypto.randomUUID();
  // The object is named after the document id, never the uploaded filename:
  // no path traversal, no unicode handling, no collisions.
  const storagePath = `documents/${documentId}.pdf`;

  const { data: signed, error: signError } = await supabase.storage
    .from(UPLOAD.bucket)
    .createSignedUploadUrl(storagePath);

  if (signError || !signed) {
    throw new UploadError(
      `El almacenamiento rechazó la carga: ${signError?.message ?? "unknown error"}. ` +
        `¿Existe el bucket "${UPLOAD.bucket}"?`,
      502,
    );
  }

  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId,
    profile_id: input.profileId,
    file_name: input.fileName,
    storage_path: storagePath,
    file_size: input.fileSize,
    mime_type: input.mimeType,
    processing_status: "UPLOADING",
  });

  if (insertError) {
    await supabase.storage.from(UPLOAD.bucket).remove([storagePath]);
    throw new UploadError(`No se pudo registrar el documento: ${insertError.message}`, 500);
  }

  return { documentId, storagePath, token: signed.token };
}

/**
 * Step 2: the browser reports how the transfer went.
 *
 * Success moves the row to PENDING — stored, waiting for the extraction step
 * that does not exist yet. Failure records why, so the row is diagnosable
 * rather than merely stuck.
 */
export async function finalizeUpload(input: {
  documentId: string;
  success: boolean;
  errorMessage?: string;
}) {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("documents")
    .update(
      input.success
        ? { processing_status: "PENDING", processing_error: null }
        : {
            processing_status: "FAILED",
            processing_error: input.errorMessage ?? "La carga no se completó.",
          },
    )
    .eq("id", input.documentId)
    .select("id, processing_status")
    .maybeSingle();

  if (error) throw new UploadError(`No se pudo actualizar el documento: ${error.message}`, 500);
  if (!data) throw new UploadError("Documento no encontrado.", 404);

  return data;
}

/** A short-lived link to the original PDF. The bucket is private; this is the only way in. */
export async function createDocumentViewUrl(documentId: string) {
  const supabase = getAdminSupabase();

  const { data: document, error } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw new UploadError(`No se pudo cargar el documento: ${error.message}`, 500);
  if (!document) throw new UploadError("Documento no encontrado.", 404);

  const { data: signed, error: signError } = await supabase.storage
    .from(UPLOAD.bucket)
    .createSignedUrl(document.storage_path, 60);

  if (signError || !signed) {
    throw new UploadError(`No se pudo generar el enlace: ${signError?.message ?? "unknown"}`, 502);
  }

  return signed.signedUrl;
}

/**
 * Which graph is treated as the working DISC profile.
 *
 * Graph 1 is ADAPTACION LABORAL — how the person behaves at work — which is what
 * a talent profile is about. Graphs 2 and 3 are preserved in `raw_scores` and
 * are never discarded, so this choice is presentational rather than lossy.
 */
const PROFILE_GRAPH = 1 as const;

export type ProcessedDocument = {
  documentId: string;
  fileName: string;
  totalPages: number;
  characters: number;
  profileId: string;
  profileCreated: boolean;
  disc: DiscProfile | null;
  capabilities: Trait[];
  attitudes: Trait[];
  report: CompetencesReport;
};

/**
 * Maps a parsed report onto the columns of `profile_assessments`.
 *
 * The four factor columns come from graph 1. The three per-scale columns are
 * left NULL on purpose: the real report has no single numeric value for
 * ADAPTACION LABORAL / CONDUCTA BAJO PRESION / IMAGEN PROPIA — each is a set of
 * four factor scores, already captured in `raw_scores`. Writing anything there
 * would mean inventing a number the PDF does not contain.
 */
function toAssessmentScores(report: CompetencesReport, disc: DiscProfile | null) {
  const profileGraph = report.graphs[PROFILE_GRAPH];

  return {
    dominance: profileGraph?.dominance ?? null,
    influence: profileGraph?.influence ?? null,
    steadiness: profileGraph?.steadiness ?? null,
    control: profileGraph?.control ?? null,

    // No numeric source in the report — see the note above.
    adaptacion_laboral: null,
    conducta_bajo_presion: null,
    imagen_propia: null,

    raw: {
      profileGraph: PROFILE_GRAPH,
      // Factor-per-row, graph-per-column, exactly as printed.
      matrix: report.matrix,
      // The same numbers pivoted per graph, for convenience.
      graphs: report.graphs,
      disc: disc
        ? {
            primary: disc.primary.letter,
            secondary: disc.secondary.letter,
            combination: disc.combination,
            scores: Object.fromEntries(disc.ranked.map((f) => [f.letter, f.score])),
          }
        : null,
    },
  };
}

/**
 * The full processing pipeline for one uploaded PDF.
 *
 * Download -> text -> parse -> derive traits, all in TypeScript; then a single
 * `apply_document_analysis` RPC performs every database write. A Postgres
 * function body is one transaction, so the profile, the assessment, both trait
 * tables and the document's own row either all land or none do — there is no
 * half-processed state to clean up afterwards.
 *
 * Idempotent. Re-processing the same document updates its assessment (unique on
 * document_id), replaces only the traits that document previously produced, and
 * re-matches the same profile by normalised name instead of creating a second.
 *
 * The PDF bytes stay in memory: nothing is written to disk, which is what makes
 * this safe on a read-only serverless filesystem.
 */
export async function processDocument(documentId: string): Promise<ProcessedDocument> {
  const supabase = getAdminSupabase();

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, file_name, storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw new UploadError(`No se pudo cargar el documento: ${error.message}`, 500);
  if (!document) throw new UploadError("Documento no encontrado.", 404);

  await supabase
    .from("documents")
    .update({ processing_status: "PROCESSING", processing_error: null })
    .eq("id", documentId);

  try {
    const { data: file, error: downloadError } = await supabase.storage
      .from(UPLOAD.bucket)
      .download(document.storage_path);

    if (downloadError || !file) {
      throw new Error(
        `No se pudo descargar el PDF del almacenamiento: ${downloadError?.message ?? "unknown error"}`,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractPdfText(bytes);
    const report = parseCompetencesReport(extracted.text);

    // The name is the only identity this format carries, so without it there is
    // nothing to attach the analysis to.
    if (!report.full_name) {
      throw new Error(
        'No se encontró la línea "Nombre:", por lo que el informe no puede asociarse a una persona.',
      );
    }

    const profileGraph = report.graphs[PROFILE_GRAPH];
    const disc = profileGraph ? classifyDisc(profileGraph) : null;
    const { capabilities, attitudes } = extractTraits(report.sections);

    const { data: applied, error: rpcError } = await supabase.rpc("apply_document_analysis", {
      p_document_id: documentId,
      p_full_name: report.full_name,
      p_report_date: report.report_date,
      p_scores: toAssessmentScores(report, disc),
      p_sections: {
        conductas_observables_1: report.sections.conductas_observables_graph_1,
        conductas_observables_2: report.sections.conductas_observables_graph_2,
        conductas_observables_3: report.sections.conductas_observables_graph_3,
        motivadores: report.sections.motivadores,
        entorno_laboral_ideal: report.sections.entorno_laboral_ideal,
        otros_comentarios: report.sections.otros_comentarios,
      },
      p_capabilities: capabilities,
      p_attitudes: attitudes,
    });

    if (rpcError) throw new Error(`No se pudo guardar el análisis: ${rpcError.message}`);
    if (!applied) throw new Error("El análisis no devolvió ningún perfil.");

    // apply_document_analysis marks the document COMPLETED inside the same
    // transaction as the writes above, so there is nothing to update here.
    return {
      documentId: document.id,
      fileName: document.file_name,
      totalPages: extracted.totalPages,
      characters: extracted.text.length,
      profileId: applied.profile_id,
      profileCreated: applied.profile_created,
      disc,
      capabilities,
      attitudes,
      report,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Error al procesar el documento.";

    // Record why before rethrowing, so a failed document is diagnosable in the UI
    // rather than left stuck in PROCESSING. Never marked COMPLETED.
    await supabase
      .from("documents")
      .update({ processing_status: "FAILED", processing_error: message.slice(0, 500) })
      .eq("id", documentId);

    throw new UploadError(message, 422);
  }
}
