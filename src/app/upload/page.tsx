import Link from "next/link";

import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { UploadForm } from "@/components/upload-form";
import { formatBytes, formatDate } from "@/lib/format";
import { listDocuments } from "@/server/documents";
import { listProfiles } from "@/server/profiles";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const [profiles, documents] = await Promise.all([listProfiles(), listDocuments(20)]);

  return (
    <>
      <PageHeader
        title="Upload documents"
        description="PDFs are stored in a private bucket. Only the metadata is shown here."
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <UploadForm profiles={profiles.map((p) => ({ id: p.id, full_name: p.full_name }))} />

        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent uploads</h2>
          {documents.length === 0 ? (
            <EmptyState>Nothing uploaded yet.</EmptyState>
          ) : (
            <Card className="divide-y divide-slate-100 p-0">
              {documents.map((document) => (
                <div key={document.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-medium">{document.file_name}</p>
                    <StatusBadge status={document.processing_status} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-500">
                    <span>
                      {document.profile ? (
                        <Link
                          href={`/profiles/${document.profile.id}`}
                          className="hover:text-slate-900"
                        >
                          {document.profile.full_name}
                        </Link>
                      ) : (
                        "Unassigned"
                      )}
                    </span>
                    <span>{formatBytes(document.file_size)}</span>
                    <span>{formatDate(document.created_at)}</span>
                  </div>
                  {document.processing_error ? (
                    <p className="mt-1 text-sm text-red-600">{document.processing_error}</p>
                  ) : null}
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
