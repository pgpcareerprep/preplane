import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".claude/**",          // git worktrees / agent scratch space
      "supabase/functions/**", // Deno edge functions — separate toolchain
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // `any` is sometimes the correct escape hatch for dynamic Supabase rows
      // and PostgREST responses where the shape is schema-driven not TypeScript-driven.
      // We downgrade from error to warn so CI stays green while we improve types over time.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
