import Link from "next/link";

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
              <Link
                key={profile.id}
                href={`/profiles/${profile.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-400"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">{profile.full_name}</h2>
                  <span className="text-sm text-slate-500">
                    {profile.experience_years === null
                      ? "Experience not recorded"
                      : `${profile.experience_years} yrs experience`}
                  </span>
                </div>

                <p className="mt-0.5 text-sm text-slate-600">
                  {[profile.position, profile.department].filter(Boolean).join(" · ") ||
                    "No position recorded"}
                </p>

                {profile.summary ? (
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600">{profile.summary}</p>
                ) : null}

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
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}
