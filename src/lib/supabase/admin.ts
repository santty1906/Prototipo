import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

import type { Database } from "./database.types";

/**
 * Service-role client — BYPASSES ROW LEVEL SECURITY.
 *
 * The MVP has no authentication, so RLS denies the anon key everything and all
 * data access runs through here, on the server, in `src/server/**` and the API
 * routes. ESLint blocks importing it anywhere else (see eslint.config.mjs).
 *
 * When auth lands, most of these calls move to a request-scoped anon client and
 * this one stays only for genuinely user-less work.
 */
let adminClient: ReturnType<typeof createClient<Database>> | undefined;

export function getAdminSupabase() {
  adminClient ??= createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  return adminClient;
}
