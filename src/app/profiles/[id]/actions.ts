"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { deleteProfile, updateProfile } from "@/server/profiles";

/**
 * Server actions for managing one candidate.
 *
 * Both validate the id as a UUID before touching the database: these are
 * reachable by direct POST, not only through the UI.
 */

const idSchema = z.string().uuid("Identificador de candidato no válido.");

const updateSchema = z.object({
  id: idSchema,
  full_name: z
    .string()
    .trim()
    .min(1, "El nombre completo es obligatorio.")
    .max(200, "El nombre es demasiado largo."),
  position: z.string().trim().max(200, "El cargo es demasiado largo."),
  department: z.string().trim().max(200, "El departamento es demasiado largo."),
  education: z.string().trim().max(500, "La formación es demasiado larga."),
  experience_years: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (/^\d{1,2}$/.test(value) && Number(value) <= 70),
      "Los años de experiencia deben ser un número entre 0 y 70.",
    ),
});

// Every runtime export of a "use server" module becomes a callable server
// reference, so only async functions may be exported from here. The initial form
// state lives with its consumer instead; the type is erased at compile time and
// is safe to export.
export type ProfileFormState = { status: "idle" | "success" | "error"; message: string | null };

/** Empty inputs are stored as NULL, preserving the columns' nullability. */
const orNull = (value: string) => (value === "" ? null : value);

export async function updateProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  const { id, ...input } = parsed.data;

  try {
    await updateProfile(id, {
      full_name: input.full_name,
      position: orNull(input.position),
      department: orNull(input.department),
      education: orNull(input.education),
      experience_years: input.experience_years === "" ? null : Number(input.experience_years),
    });
  } catch (cause) {
    return {
      status: "error",
      message: cause instanceof Error ? cause.message : "No se pudo guardar el candidato.",
    };
  }

  // Refreshes the detail page and the list, so the new values appear immediately.
  revalidatePath(`/profiles/${id}`);
  revalidatePath("/profiles");

  return { status: "success", message: "Cambios guardados correctamente." };
}

export async function deleteProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = idSchema.safeParse(formData.get("id"));

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  try {
    await deleteProfile(parsed.data);
  } catch (cause) {
    return {
      status: "error",
      message: cause instanceof Error ? cause.message : "No se pudo eliminar el candidato.",
    };
  }

  revalidatePath("/profiles");
  // redirect() throws, so it must sit outside the try block above.
  redirect("/profiles?deleted=1");
}
