import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),

  /**
   * Architectural boundary: the service-role Supabase client bypasses every RLS
   * policy, so its blast radius has to stay small enough to review by hand.
   * Only the API routes and `src/server/**` may reach for it; everything else
   * goes through those.
   */
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**", "src/server/**", "src/lib/supabase/admin.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/supabase/admin", "@/lib/supabase/admin"],
              message:
                "The service-role client bypasses RLS. Call a function from src/server/ instead.",
            },
            {
              group: ["**/env.server", "@/lib/env.server"],
              message:
                "Server-only environment. Move this code into src/server/ or an API route.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
