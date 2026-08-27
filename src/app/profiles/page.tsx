import Link from "next/link";

import { DiscCardSummary } from "@/components/disc-profile";
import { ProfileActions } from "@/components/profile-actions";
import { ProfileFilters } from "@/components/profile-filters";
import { ButtonLink, Chip, EmptyState, PageHeader } from "@/components/ui";
import { listProfiles, listTraitOptions } from "@/server/profiles";

export const dynamic = "force-dynamic";

/** `?capability=react&capability=sql` arrives as a string or an array. */
function toArray(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function ProfilesPage({ searchParams }: PageProps<"/profiles">) {
  const params = await searchParams;
  const selected = {
    q: typeof params.q === "string" ? params.q : "",
    capabilities: toArray(params.capability),
    attitudes: toArray(params.attitude),
  };

  const [profiles, options] = await Promise.all([
    listProfiles(selected),
    listTraitOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Profiles"
        description={`${profiles.length} ${profiles.length === 1 ? "profile" : "profiles"} matching.`}
        action={<ButtonLink href="/profiles/new">New profile</ButtonLink>}
      />

      {params.deleted ? (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Candidato eliminado correctamente.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <ProfileFilters
          capabilityOptions={options.capabilities}
          attitudeOptions={options.attitudes}
          selected={selected}
        />

        <div className="space-y-3">
          {profiles.length === 0 ? (
            <EmptyState>No profiles match these filters.</EmptyState>
          ) : (
            profiles.map((profile) => (
              // Not one big <Link> any more: the actions menu is a button, and a
              // button nested inside an anchor is invalid markup that swallows
              // its own clicks. The candidate's name carries the link instead.
              <div
                key={profile.id}
                className="rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">
                      <Link
                        href={`/profiles/${profile.id}`}
                        className="hover:underline focus:underline focus:outline-none"
                      >
                        {profile.full_name}
                      </Link>
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {[profile.position, profile.department].filter(Boolean).join(" · ") ||
                        "Sin cargo registrado"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {profile.experience_years === null
                        ? "Experiencia no registrada"
                        : `${profile.experience_years} años de experiencia`}
                    </p>
                  </div>

                  <ProfileActions
                    profile={{
                      id: profile.id,
                      full_name: profile.full_name,
                      position: profile.position,
                      department: profile.department,
                      education: profile.education,
                      experience_years: profile.experience_years,
                    }}
                  />
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <DiscCardSummary graph1={profile.graph1} />
                </div>

                {profile.capabilities.length + profile.attitudes.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {profile.capabilities.map((trait) => (
                      <Chip key={`c-${trait.code}`}>{trait.label}</Chip>
                    ))}
                    {profile.attitudes.map((trait) => (
                      <Chip key={`a-${trait.code}`}>{trait.label}</Chip>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
