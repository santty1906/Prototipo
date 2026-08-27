"use client";

import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Browser client — anon key, RLS enforced (which currently means: no table
 * access at all).
 *
 * Its only job is pushing file bytes to a signed upload URL, which is
 * authorised by the token in the URL rather than by the key. Page data is
 * fetched on the server; do not add data loading here.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function getBrowserSupabase() {
  browserClient ??= createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return browserClient;
}
