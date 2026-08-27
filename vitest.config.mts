import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolves the "@/..." aliases from tsconfig.json, so tests import
    // application modules exactly as the app does.
    tsconfigPaths: true,
  },
});
