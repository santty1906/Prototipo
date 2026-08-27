import "server-only";

import { z } from "zod";

/**
 * Server-only environment.
 *
 * The `server-only` import above is the guard: if a client component ever pulls
 * this module into its graph, the build fails rather than leaking the service
 * key into a browser bundle.
 *
 * Validated lazily so `next build` does not require production secrets at build
 * time — only a request that actually needs them fails.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required for server-side Supabase access"),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  if (cached) return cached;

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      "Invalid server environment:\n" +
        parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"),
    );
  }

  cached = parsed.data;
  return cached;
}
