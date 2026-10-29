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
    files: ["src/components/legacy/button.tsx", "src/components/legacy/badge.tsx"],
    rules: {
      "react-refresh/only-export-components": ["error", {
        allowConstantExport: true,
        allowExportNames: ["buttonVariants", "badgeVariants"],
      }],
    },
  },
  {
    // coss ui 원본 소스(shadcn CLI로 받은 파일). 컴포넌트와 함께 variants·toastManager·Primitive를 내보내는 것이
    // coss ui의 설계라서 이 규칙만 끈다. 원본을 고치지 않아야 coss ui를 다시 받아 업데이트하기 쉽다.
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}"],
    languageOptions: { globals: globals.vitest },
  },
]);
