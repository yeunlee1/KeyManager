import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default defineConfig([
  globalIgnores(["dist", "coverage"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{js,ts,tsx}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
    },
  },
  {
    files: ["src/components/ui/button.tsx", "src/components/ui/badge.tsx"],
    rules: {
      "react-refresh/only-export-components": ["error", {
        allowConstantExport: true,
        allowExportNames: ["buttonVariants", "badgeVariants"],
      }],
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}"],
    languageOptions: { globals: globals.vitest },
  },
]);
