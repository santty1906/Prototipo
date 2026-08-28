import Link from "next/link";
import { notFound } from "next/navigation";

import { AiConsultant } from "@/components/ai-consultant";
import { DiscProfilePanel } from "@/components/disc-profile";
import { DocumentLink } from "@/components/document-link";
import { ProfileActions } from "@/components/profile-actions";
import { Card, Chip, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { formatBytes, formatDate } from "@/lib/format";
import { classifyDisc } from "@/server/pdf/disc";
import { getProfile } from "@/server/profiles";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: PageProps<"/profiles/[id]">) {
  const { id } = await params;
  const profile = await getProfile(id);

  if (!profile) notFound();

  // Shown in the consultant header so the reader knows which profile is loaded.
  const discSummary = profile.graphs[1]
    ? (() => {
        const disc = classifyDisc(profile.graphs[1]);
        return `${disc.combination} — ${disc.combinationNameEs}`;
      })()
    : null;

  const facts = [
    { label: "Correo electrónico", value: profile.email },
    { label: "Teléfono", value: profile.phone },
    { label: "Cargo", value: profile.position },
    { label: "Departamento", value: profile.department },
    { label: "Formación", value: profile.education },
    {
      label: "Experiencia",
      value:
        profile.experience_years === null ? null : `${profile.experience_years} años`,
    },
  ];

  return (
    <>
      <Link href="/profiles" className="text-sm text-slate-600 hover:text-slate-900">
        ← Volver a perfiles
      </Link>

      <div className="mt-4">
        <PageHeader
          title={profile.full_name}
          description={`Añadido el ${formatDate(profile.created_at)}`}
          action={
            <ProfileActions
              showView={false}
              profile={{
                id: profile.id,
                full_name: profile.full_name,
                position: profile.position,
                department: profile.department,
                education: profile.education,
                experience_years: profile.experience_years,
              }}
            />
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <DiscProfilePanel graphs={profile.graphs} />

          {profile.assessment ? (
            <Card>
              <h2 className="mb-3 text-sm font-medium text-slate-600">Informe de competencias</h2>
              <div className="space-y-4 text-sm leading-relaxed">
                <ReportSection
                  title="Conductas observables — Gráfica 1 (Adaptación Laboral)"
                  body={profile.assessment.conductas_observables_1}
                />
                <ReportSection
                  title="Conductas observables — Gráfica 2 (Conducta Bajo Presión)"
                  body={profile.assessment.conductas_observables_2}
                />
                <ReportSection
                  title="Conductas observables — Gráfica 3 (Imagen Propia)"
                  body={profile.assessment.conductas_observables_3}
                />
                <ReportSection title="Motivadores" body={profile.assessment.motivadores} />
                <ReportSection
                  title="Entorno laboral ideal"
                  body={profile.assessment.entorno_laboral_ideal}
                />
                <ReportSection
                  title="Otros comentarios"
                  body={profile.assessment.otros_comentarios}
                />
              </div>
            </Card>
          ) : null}

          {profile.summary ? (
            <Card>
              <h2 className="mb-2 text-sm font-medium text-slate-600">Resumen</h2>
              <p className="text-sm leading-relaxed">{profile.summary}</p>
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-3 text-sm font-medium text-slate-600">Competencias</h2>
            {profile.capabilities.length === 0 ? (
              <p className="text-sm text-slate-500">Sin registrar.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {profile.capabilities.map((trait) => (
                  <Chip key={trait.code}>{trait.label}</Chip>
                ))}
              </div>
            )}

            <h2 className="mt-5 mb-3 text-sm font-medium text-slate-600">Actitudes</h2>
            {profile.attitudes.length === 0 ? (
              <p className="text-sm text-slate-500">Sin registrar.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {profile.attitudes.map((trait) => (
                  <Chip key={trait.code}>{trait.label}</Chip>
                ))}
              </div>
            )}
          </Card>

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Documentos</h2>
              <Link
                href={`/upload?profileId=${profile.id}`}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Cargar PDF
              </Link>
            </div>

            {profile.documents.length === 0 ? (
              <EmptyState>Este perfil todavía no tiene documentos.</EmptyState>
            ) : (
              <Card className="divide-y divide-slate-100 p-0">
                {profile.documents.map((document) => (
                  <div key={document.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{document.file_name}</p>
                      <StatusBadge status={document.processing_status} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span>{formatBytes(document.file_size)}</span>
                      <span>{formatDate(document.created_at)}</span>
                      <DocumentLink documentId={document.id} />
                    </div>
                    {document.processing_error ? (
                      <p className="mt-2 text-sm text-red-600">{document.processing_error}</p>
                    ) : null}
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>

        <div className="h-fit space-y-4">
          <AiConsultant
            profileId={profile.id}
            profileName={profile.full_name}
            discSummary={discSummary}
          />

          <Card>
            <h2 className="mb-3 text-sm font-medium text-slate-600">Datos del candidato</h2>
            <dl className="space-y-3 text-sm">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-slate-500">{fact.label}</dt>
                  <dd className="mt-0.5 break-words">{fact.value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

/** One titled block of report prose. Renders nothing when the section is absent. */
function ReportSection({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      <p className="whitespace-pre-wrap text-slate-700">{body}</p>
    </div>
  );
}
