"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  deleteProfileAction,
  updateProfileAction,
  type ProfileFormState,
} from "@/app/profiles/[id]/actions";

// Declared here rather than imported: a "use server" module may only export
// async functions, so the initial state cannot travel with the actions.
const initialProfileFormState: ProfileFormState = {
  status: "idle",
  message: null,
};

/**
 * Per-candidate actions menu: view, edit, delete.
 *
 * Used on both the list card and the detail page, so a candidate can be managed
 * without first opening them.
 */

export type EditableProfile = {
  id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  education: string | null;
  experience_years: number | null;
};

export function ProfileActions({
  profile,
  showView = true,
}: {
  profile: EditableProfile;
  showView?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape, as any menu should.
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Acciones para ${profile.full_name}`}
        // Generous tap target so the menu stays usable on a phone.
        className="flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ⋮
        </span>
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {showView ? (
            <Link
              href={`/profiles/${profile.id}`}
              role="menuitem"
              className="block px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => setMenuOpen(false)}
            >
              Ver perfil
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setDialog("edit");
            }}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            Editar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setDialog("delete");
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            Eliminar
          </button>
        </div>
      ) : null}

      {dialog === "edit" ? (
        <EditProfileDialog profile={profile} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "delete" ? (
        <DeleteProfileDialog profile={profile} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

/** Shared modal shell: backdrop, Escape to close, centred and scrollable on small screens. */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-slate-900/30" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative my-8 w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 text-left shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditProfileDialog({
  profile,
  onClose,
}: {
  profile: EditableProfile;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(updateProfileAction, initialProfileFormState);

  // Close once the server confirms the write, so the refreshed page shows through.
  useEffect(() => {
    if (state.status !== "success") return;
    const timer = setTimeout(onClose, 900);
    return () => clearTimeout(timer);
  }, [state.status, onClose]);

  return (
    <Modal title="Editar candidato" onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={profile.id} />

        <Field name="full_name" label="Nombre completo" defaultValue={profile.full_name} required />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="position" label="Cargo" defaultValue={profile.position ?? ""} />
          <Field name="department" label="Departamento" defaultValue={profile.department ?? ""} />
          <Field name="education" label="Formación" defaultValue={profile.education ?? ""} />
          <Field
            name="experience_years"
            label="Años de experiencia"
            defaultValue={
              profile.experience_years === null ? "" : String(profile.experience_years)
            }
            inputMode="numeric"
            hint="0 a 70. Déjelo vacío si no se conoce."
          />
        </div>

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

        <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Cancelar
          </button>
          <SubmitButton idle="Guardar cambios" busy="Guardando…" />
        </div>
      </form>
    </Modal>
  );
}

function DeleteProfileDialog({
  profile,
  onClose,
}: {
  profile: EditableProfile;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(deleteProfileAction, initialProfileFormState);

  return (
    <Modal title="Eliminar candidato" onClose={onClose}>
      <p className="text-sm">¿Está seguro de que desea eliminar este candidato?</p>

      <p className="mt-3 text-sm font-medium">{profile.full_name}</p>

      <div className="mt-3 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <p>Se eliminarán de forma permanente:</p>
        <ul className="mt-1.5 space-y-0.5">
          <li>· El perfil del candidato</li>
          <li>· Su evaluación DISC y las puntuaciones registradas</li>
          <li>· Sus competencias y actitudes</li>
          <li>· Los documentos PDF asociados, incluidos los archivos almacenados</li>
        </ul>
        <p className="mt-2">Esta acción no se puede deshacer.</p>
      </div>

      {state.message ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="status">
          {state.message}
        </p>
      ) : null}

      <form action={formAction} className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <input type="hidden" name="id" value={profile.id} />
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Cancelar
        </button>
        <DeleteButton />
      </form>
    </Modal>
  );
}

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
    >
      {pending ? busy : idle}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {pending ? "Eliminando…" : "Eliminar candidato"}
    </button>
  );
}

function Field({
  name,
  label,
  hint,
  ...props
}: { name: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={`edit-${name}`} className="mb-1.5 block text-sm font-medium">
        {label}
        {props.required ? <span className="text-red-600"> *</span> : null}
      </label>
      <input
        id={`edit-${name}`}
        name={name}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        {...props}
      />
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
