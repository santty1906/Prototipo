import "server-only";

import { UPLOAD } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { DocumentRow, ProcessingStatus } from "@/lib/supabase/database.types";

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

  if (error) throw new Error(`Could not load documents: ${error.message}`);

  const documents = data ?? [];
  const profileIds = [...new Set(documents.map((d) => d.profile_id).filter((id) => id !== null))];
  const names = new Map<string, string>();

  if (profileIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);

    if (profileError) throw new Error(`Could not load profile names: ${profileError.message}`);
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

  if (error) throw new Error(`Could not count documents: ${error.message}`);

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
    throw new UploadError("Only PDF files are accepted.");
  }
  if (input.fileSize <= 0 || input.fileSize > UPLOAD.maxBytes) {
    throw new UploadError(
      `"${input.fileName}" is larger than the ${UPLOAD.maxBytes / 1024 / 1024} MB limit.`,
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
      `Storage rejected the upload: ${signError?.message ?? "unknown error"}. ` +
        `Does the "${UPLOAD.bucket}" bucket exist?`,
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
    throw new UploadError(`Could not record the document: ${insertError.message}`, 500);
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
            processing_error: input.errorMessage ?? "The upload did not complete.",
          },
    )
    .eq("id", input.documentId)
    .select("id, processing_status")
    .maybeSingle();

  if (error) throw new UploadError(`Could not update the document: ${error.message}`, 500);
  if (!data) throw new UploadError("Document not found.", 404);

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

  if (error) throw new UploadError(`Could not load the document: ${error.message}`, 500);
  if (!document) throw new UploadError("Document not found.", 404);

  const { data: signed, error: signError } = await supabase.storage
    .from(UPLOAD.bucket)
    .createSignedUrl(document.storage_path, 60);

  if (signError || !signed) {
    throw new UploadError(`Could not create a link: ${signError?.message ?? "unknown"}`, 502);
  }

  return signed.signedUrl;
}
