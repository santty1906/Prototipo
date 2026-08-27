"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { UPLOAD } from "@/lib/env";
import { formatBytes } from "@/lib/format";
import { getBrowserSupabase } from "@/lib/supabase/client";

type FileState = {
  name: string;
  size: number;
  status: "queued" | "uploading" | "done" | "error";
  message?: string;
};

/**
 * Multi-PDF upload.
 *
 * Bytes go from here straight to Supabase Storage using a one-shot token the
 * server mints; this app never sees the file. Files are sent one at a time —
 * simple, and it keeps a big batch from saturating the connection.
 */
export function UploadForm({ profiles }: { profiles: { id: string; full_name: string }[] }) {
  const router = useRouter();
  const [profileId, setProfileId] = useState("");
  const [files, setFiles] = useState<FileState[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  function update(index: number, patch: Partial<FileState>) {
    setFiles((current) =>
      current.map((file, i) => (i === index ? { ...file, ...patch } : file)),
    );
  }

  async function uploadOne(file: File, index: number) {
    update(index, { status: "uploading" });

    const ticketResponse = await fetch("/api/documents/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || UPLOAD.mimeType,
        profileId: profileId || null,
      }),
    });

    const ticket = await ticketResponse.json();
    if (!ticketResponse.ok) throw new Error(ticket.error ?? "Could not start the upload.");

    const { error } = await getBrowserSupabase()
      .storage.from(ticket.bucket)
      .uploadToSignedUrl(ticket.storagePath, ticket.token, file, {
        contentType: UPLOAD.mimeType,
      });

    // Report the outcome either way, so a failed transfer leaves a FAILED row
    // with a reason rather than one stuck at UPLOADING forever.
    await fetch("/api/documents/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: ticket.documentId,
        success: !error,
        errorMessage: error?.message,
      }),
    });

    if (error) throw new Error(error.message);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("files") as HTMLInputElement;
    const selected = Array.from(input.files ?? []);
    if (selected.length === 0) return;

    setFiles(
      selected.map((file) => ({ name: file.name, size: file.size, status: "queued" as const })),
    );
    setIsUploading(true);

    for (const [index, file] of selected.entries()) {
      try {
        await uploadOne(file, index);
        update(index, { status: "done" });
      } catch (cause) {
        update(index, {
          status: "error",
          message: cause instanceof Error ? cause.message : "Upload failed.",
        });
      }
    }

    setIsUploading(false);
    input.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-lg border border-slate-200 bg-white p-6"
      >
        <div>
          <label htmlFor="profileId" className="mb-1.5 block text-sm font-medium">
            Attach to profile
          </label>
          <select
            id="profileId"
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          >
            <option value="">Leave unassigned</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="files" className="mb-1.5 block text-sm font-medium">
            PDF files
          </label>
          <input
            id="files"
            name="files"
            type="file"
            accept="application/pdf"
            multiple
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Up to {UPLOAD.maxFilesPerBatch} files, {UPLOAD.maxBytes / 1024 / 1024} MB each.
          </p>
        </div>

        <button
          type="submit"
          disabled={isUploading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isUploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      {files.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-600">
            This batch
          </h2>
          <ul className="divide-y divide-slate-100">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="px-5 py-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="min-w-0 truncate text-sm">{file.name}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs">
                    <span className="text-slate-500">{formatBytes(file.size)}</span>
                    <BatchStatus status={file.status} />
                  </span>
                </div>
                {file.message ? (
                  <p className="mt-1 text-xs text-red-600">{file.message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const BATCH_LABELS: Record<FileState["status"], { text: string; className: string }> = {
  queued: { text: "Queued", className: "text-slate-500" },
  uploading: { text: "Uploading…", className: "text-blue-600" },
  done: { text: "Uploaded", className: "text-emerald-600" },
  error: { text: "Failed", className: "text-red-600" },
};

function BatchStatus({ status }: { status: FileState["status"] }) {
  const { text, className } = BATCH_LABELS[status];
  return <span className={`font-medium ${className}`}>{text}</span>;
}
