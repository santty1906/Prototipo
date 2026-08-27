import { NewProfileForm } from "@/components/new-profile-form";
import { PageHeader } from "@/components/ui";

export default function NewProfilePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New profile"
        description="Only the name is required — the rest can be filled in later."
      />
      <NewProfileForm />
    </div>
  );
}
