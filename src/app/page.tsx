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
    { label: "Perfiles", value: profiles.length },
    { label: "Documentos", value: documentStats.total },
    {
      label: "Pendientes de procesar",
      value: documentStats.counts.UPLOADING + documentStats.counts.PENDING,
    },
    { label: "Cargas con error", value: documentStats.counts.FAILED },
  ];

  return (
    <>
      <PageHeader
        title="Panel"
        description="Todo lo que hay actualmente en el sistema."
        action={<ButtonLink href="/upload">Cargar PDF</ButtonLink>}
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
            <h2 className="text-lg font-semibold">Perfiles recientes</h2>
            <Link href="/profiles" className="text-sm text-slate-600 hover:text-slate-900">
              Ver todos
            </Link>
          </div>
          {profiles.length === 0 ? (
            <EmptyState>
              Aún no hay perfiles. <Link href="/profiles/new" className="underline">Añada el primero</Link>.
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
                      {profile.position ?? "Sin cargo registrado"}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(profile.created_at)}</span>
                </Link>
              ))}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Documentos recientes</h2>
          {documents.length === 0 ? (
            <EmptyState>
              Aún no se ha cargado ningún PDF. <Link href="/upload" className="underline">Cargue alguno</Link>.
            </EmptyState>
          ) : (
            <Card className="divide-y divide-slate-100 p-0">
              {documents.map((document) => (
                <div key={document.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{document.file_name}</p>
                    <p className="text-sm text-slate-500">
                      {document.profile ? document.profile.full_name : "Sin asignar"}
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
