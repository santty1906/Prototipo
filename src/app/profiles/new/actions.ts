"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { parseTraitList } from "@/lib/format";
import { createProfile } from "@/server/profiles";

const schema = z.object({
  full_name: z.string().trim().min(1, "A name is required.").max(200),
  email: z.string().trim().email("That email address is not valid.").or(z.literal("")),
  phone: z.string().trim().max(50),
  position: z.string().trim().max(200),
  department: z.string().trim().max(200),
  education: z.string().trim().max(500),
  experience_years: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{1,2}$/.test(value), "Years must be a number 0–70."),
  summary: z.string().trim().max(2000),
  capabilities: z.string().max(1000),
  attitudes: z.string().max(1000),
});

export type FormState = { error: string | null };

/** Empty inputs become NULL rather than empty strings — "unknown" is not "". */
const orNull = (value: string) => (value === "" ? null : value);

export async function createProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues.map((issue) => issue.message).join(" ") };
  }

  const input = parsed.data;
  let id: string;

  try {
    id = await createProfile({
      full_name: input.full_name,
      email: orNull(input.email),
      phone: orNull(input.phone),
      position: orNull(input.position),
      department: orNull(input.department),
      education: orNull(input.education),
      experience_years: input.experience_years === "" ? null : Number(input.experience_years),
      summary: orNull(input.summary),
      capabilities: parseTraitList(input.capabilities),
      attitudes: parseTraitList(input.attitudes),
    });
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Could not create the profile." };
  }

  // redirect() throws, so it must sit outside the try block above.
  redirect(`/profiles/${id}`);
}
