import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests. They must never reach a live service:
 *  - every Supabase, payment and AI key is blank here (and test/setup.ts
 *    refuses to run if one leaked in), so the code under test takes its
 *    no-database paths;
 *  - each test file runs in its own temporary working directory, so the
 *    development file stores (.vortaly/) are written there, not in the repo;
 *  - the Telegram token is a fake one the tests sign payloads with.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // Next's marker package throws outside a React Server bundle.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    // Forks, not threads: the setup file changes the working directory.
    pool: "forks",
    setupFiles: ["test/setup.ts"],
    env: {
      NODE_ENV: "test",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SECRET_KEY: "",
      TELEGRAM_BOT_TOKEN: "123456:test-token",
      PLATFORM_ADMIN_SECRET: "test-admin-secret",
      VORTALY_KEY_SECRET: "test-key-secret",
      VORTALY_FREE_AI_ACTIONS: "",
      VORTALY_MODEL_PROVIDER: "",
      VORTALY_MODEL_ID: "",
      GROQ_API_KEY_1: "",
      GEMINI_API_KEY_1: "",
      OPENROUTER_API_KEY_1: "",
      ORCAROUTER_API_KEY_1: "",
      CLICK_SECRET_KEY: "",
      PAYME_MERCHANT_ID: "",
      NEXT_PUBLIC_ROOT_DOMAIN: "vortaly.com",
    },
  },
});
