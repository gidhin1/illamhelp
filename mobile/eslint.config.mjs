import js from "@eslint/js";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";
import tsEslintParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "android/**",
      "ios/**",
      "artifacts/**",
      "dist/**",
      "coverage/**"
    ]
  },
  js.configs.recommended,
  ...tsEslintPlugin.configs["flat/recommended"],
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsEslintParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: {
        ...globals.browser,
        ...globals.es2022
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ]
    }
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },
  {
    files: ["e2e/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.es2022
      }
    }
  },
  {
    files: ["e2e/**/*.e2e.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.es2022,
        device: "readonly",
        element: "readonly",
        by: "readonly",
        waitFor: "readonly"
      }
    }
  }
];
