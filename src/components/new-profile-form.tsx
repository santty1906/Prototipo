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
      <Field name="full_name" label="Full name" required />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="email" label="Email" type="email" />
        <Field name="phone" label="Phone" />
        <Field name="position" label="Position" />
        <Field name="department" label="Department" />
        <Field name="education" label="Education" />
        <Field name="experience_years" label="Years of experience" inputMode="numeric" />
      </div>

      <Field name="summary" label="Summary" multiline />

      <Field
        name="capabilities"
        label="Capabilities"
        hint="Comma separated, e.g. React, SQL, Design Systems"
      />
      <Field
        name="attitudes"
        label="Attitudes"
        hint="Comma separated, e.g. Ownership, Collaboration"
      />

      {state.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <Link href="/profiles" className="text-sm text-slate-600 hover:text-slate-900">
          Cancel
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
      {pending ? "Saving…" : "Create profile"}
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
