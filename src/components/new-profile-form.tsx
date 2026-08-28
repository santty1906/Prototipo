"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createProfileAction, type FormState } from "@/app/profiles/new/actions";

const initialState: FormState = { error: null };

export function NewProfileForm() {
  const [state, formAction] = useActionState(createProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
      <Field name="full_name" label="Nombre completo" required />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="email" label="Correo electrónico" type="email" />
        <Field name="phone" label="Teléfono" />
        <Field name="position" label="Cargo" />
        <Field name="department" label="Departamento" />
        <Field name="education" label="Formación" />
        <Field name="experience_years" label="Años de experiencia" inputMode="numeric" />
      </div>

      <Field name="summary" label="Resumen" multiline />

      <Field
        name="capabilities"
        label="Competencias"
        hint="Separadas por comas, p. ej. React, SQL, Sistemas de Diseño"
      />
      <Field
        name="attitudes"
        label="Actitudes"
        hint="Separadas por comas, p. ej. Responsabilidad, Colaboración"
      />

      {state.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <Link href="/profiles" className="text-sm text-slate-600 hover:text-slate-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
    >
      {pending ? "Guardando…" : "Crear perfil"}
    </button>
  );
}

function Field({
  name,
  label,
  hint,
  multiline,
  ...props
}: {
  name: string;
  label: string;
  hint?: string;
  multiline?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const className =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";

  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">
        {label}
        {props.required ? <span className="text-red-600"> *</span> : null}
      </label>
      {multiline ? (
        <textarea id={name} name={name} rows={3} className={className} />
      ) : (
        <input id={name} name={name} className={className} {...props} />
      )}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
