import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `_name` marks an intentionally unused binding (a signature kept for
      // callers, or a field stripped with a rest spread).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      // The providers read browser-only state (localStorage, Telegram WebApp,
      // the URL) after mount on purpose, so the server HTML and the first
      // client render match. Kept visible as a warning, not a build failure.
      "react-hooks/set-state-in-effect": "warn",
      // Only relevant with the React Compiler, which this project does not use.
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local development data and tool folders, not source.
    ".vortaly/**",
    ".freebuff/**",
    "tmp/**",
  ]),
]);

export default eslintConfig;
