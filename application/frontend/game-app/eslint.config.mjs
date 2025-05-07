import { defineConfig, globalIgnores } from "eslint/config";
import rxjsAngular from "eslint-plugin-rxjs-angular-updated";
import rxjs from "eslint-plugin-rxjs-updated";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([globalIgnores([
    "projects/**/*",
    "**/dist",
    "**/coverage",
    "src/main.ts",
    "src/index.html",
    "src/polyfills.ts",
    "src/test.ts",
]), {
    plugins: {
        "rxjs-angular": rxjsAngular,
        rxjs,
    },
}, {
    files: ["**/*.ts"],

    extends: compat.extends(
        "plugin:@angular-eslint/recommended",
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@angular-eslint/template/process-inline-templates",
    ),

    languageOptions: {
        ecmaVersion: 5,
        sourceType: "script",

        parserOptions: {
            project: ["tsconfig.json"],
            createDefaultProgram: true,
        },
    },

    rules: {
        quotes: ["error", "single", {
            avoidEscape: true,
        }],

        "@angular-eslint/component-class-suffix": [1, {
            suffixes: ["Component", "Dialog", "Page"],
        }],

        "@angular-eslint/component-selector": ["error", {
            prefix: "app",
            style: "kebab-case",
            type: "element",
        }],

        "@angular-eslint/directive-selector": ["error", {
            prefix: "app",
            style: "camelCase",
            type: "attribute",
        }],

        "@angular-eslint/no-input-rename": "off",
        "no-case-declarations": "off",
        "@typescript-eslint/no-explicit-any": "off",

        "rxjs/no-unsafe-takeuntil": ["warn", {
            alias: ["takeUntilDestroyed"],
        }],

        "rxjs-angular/prefer-takeuntil": ["warn", {
            alias: ["takeUntilDestroyed"],
            checkComplete: true,
            checkDecorators: ["Component"],
            checkDestroy: false,
        }],

        "no-console": ["error", {
            allow: ["warn", "debug", "error"],
        }],
    },
}, {
    files: ["**/*.html"],
    extends: compat.extends("plugin:@angular-eslint/template/recommended"),
    rules: {},
}]);
