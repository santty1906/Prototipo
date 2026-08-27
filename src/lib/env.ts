import { z } from "zod";

/**
 * Public environment — inlined into the browser bundle at build time.
 *
 * Every value must be read as a *literal* `process.env.NEXT_PUBLIC_X`
 * expression. Next.js performs a static text substitution, so a dynamic lookup
 * such as `process.env[key]` silently yields `undefined` in the browser.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be the full https URL of your Supabase project"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  throw new Error(
    "Invalid public environment. Copy .env.example to .env.local and fill it in.\n" +
      parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"),
  );
}

export const env = parsed.data;

/** Upload rules, enforced on the server and mirrored in the browser for early feedback. */
export const UPLOAD = {
  bucket: "profile-documents",
  maxBytes: 25 * 1024 * 1024,
  maxFilesPerBatch: 20,
  mimeType: "application/pdf",
} as const;
