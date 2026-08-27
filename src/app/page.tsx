import Link from "next/link";

import { ButtonLink, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { countDocumentsByStatus, listDocuments } from "@/server/documents";
import { listProfiles } from "@/server/profiles";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [profiles, documents, documentStats] = await Promise.all([
    listProfiles(),
    listDocuments(8),
    countDocumentsByStatus(),
  ]);

  const stats = [
    { label: "Profiles", value: profiles.length },
    { label: "Documents", value: documentStats.total },
    {
      label: "Awaiting processing",
      value: documentStats.counts.UPLOADING + documentStats.counts.PENDING,
    },
    { label: "Failed uploads", value: documentStats.counts.FAILED },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything currently in the system."
        action={<ButtonLink href="/upload">Upload PDFs</ButtonLink>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-slate-600">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Recent profiles</h2>
            <Link href="/profiles" className="text-sm text-slate-600 hover:text-slate-900">
              View all
            </Link>
          </div>
          {profiles.length === 0 ? (
            <EmptyState>
              No profiles yet. <Link href="/profiles/new" className="underline">Add the first one</Link>.
            </EmptyState>
          ) : (
            <Card className="divide-y divide-slate-100 p-0">
              {profiles.slice(0, 5).map((profile) => (
                <Link
                  key={profile.id}
                  href={`/profiles/${profile.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium">{profile.full_name}</p>
                    <p className="text-sm text-slate-500">
                      {profile.position ?? "No position recorded"}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(profile.created_at)}</span>
                </Link>
              ))}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent documents</h2>
          {documents.length === 0 ? (
            <EmptyState>
              No PDFs uploaded yet. <Link href="/upload" className="underline">Upload some</Link>.
            </EmptyState>
          ) : (
            <Card className="divide-y divide-slate-100 p-0">
              {documents.map((document) => (
                <div key={document.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{document.file_name}</p>
                    <p className="text-sm text-slate-500">
                      {document.profile ? document.profile.full_name : "Unassigned"}
                    </p>
                  </div>
                  <StatusBadge status={document.processing_status} />
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
