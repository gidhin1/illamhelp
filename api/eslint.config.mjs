import path from "node:path";
import { fileURLToPath } from "node:url";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  ...tsEslintPlugin.configs["flat/recommended-type-checked"],
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      ...eslintConfigPrettier.rules,
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error"
    }
  },
  {
    files: ["src/**/*.spec.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off"
    }
  }
];
