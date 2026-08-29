"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  updateProfileClassificationAction,
  type ProfileFormState,
} from "@/app/profiles/[id]/actions";
import {
  COMPANIES,
  PROFILE_TYPES,
  profileTypeLabelEs,
  type Company,
  type ProfileType,
} from "@/lib/classification";
import { Card } from "@/components/ui";

// Declared here rather than imported: a "use server" module may only export
// async functions, so the initial state cannot travel with the action.
const initialState: ProfileFormState = { status: "idle", message: null };

/**
 * The HR/business classification of one candidate: Tipo and Empresa.
 *
 * Deliberately its own panel, separate from the DISC panel above it. DISC is
 * read off a processed report; these two are assigned by a person and work even
 * when the candidate has no assessment and no PDF at all.
 *
 * Stored values are preloaded as the selects' `defaultValue`, and the empty
 * option is a real choice — it is how an assignment is cleared again.
 */
export function ProfileClassification({
  profileId,
  profileType,
  company,
}: {
  profileId: string;
  profileType: ProfileType | null;
  company: Company | null;
}) {
  const [state, formAction] = useActionState(updateProfileClassificationAction, initialState);

  return (
    <Card>
      <h2 className="mb-3 text-sm font-medium text-slate-600">Clasificación</h2>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={profileId} />

        <Select
          name="profile_type"
          label="Tipo"
          placeholder="Selecciona un tipo"
          defaultValue={profileType ?? ""}
          options={PROFILE_TYPES.map((value) => ({ value, label: profileTypeLabelEs(value) }))}
        />

        <Select
          name="company"
          label="Empresa"
          placeholder="Selecciona una empresa"
          defaultValue={company ?? ""}
          options={COMPANIES.map((value) => ({ value, label: value }))}
        />

        {state.message ? (
          <p
            className={`rounded-md px-3 py-2 text-sm ${
              state.status === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
            role="status"
          >
            {state.message}
          </p>
        ) : null}

        <SaveButton />
      </form>
    </Card>
  );
}

function Select({
  name,
  label,
  placeholder,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  placeholder: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={`classification-${name}`} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={`classification-${name}`}
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
    >
      {pending ? "Guardando…" : "Guardar clasificación"}
    </button>
  );
}
