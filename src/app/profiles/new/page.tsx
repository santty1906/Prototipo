import { NewProfileForm } from "@/components/new-profile-form";
import { PageHeader } from "@/components/ui";

export default function NewProfilePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nuevo perfil"
        description="Solo el nombre es obligatorio; el resto puede completarse más adelante."
      />
      <NewProfileForm />
    </div>
  );
}
