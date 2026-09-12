import { defineConfig, globalIgnores } from "eslint/config";
import rxjsAngular from "eslint-plugin-rxjs-angular-x";
import rxjs from "eslint-plugin-rxjs-x";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import angular from "angular-eslint";
import stylistic from '@stylistic/eslint-plugin';
import html from "@html-eslint/eslint-plugin";

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
        '@stylistic': stylistic
    },
}, {
    files: ["**/*.ts"],

    extends: [
        js.configs.recommended,
        ...tseslint.configs.recommended,
        ...angular.configs.tsRecommended,
    ],

    processor: angular.processInlineTemplates,

    languageOptions: {
        ecmaVersion: 5,
        sourceType: "script",

        parserOptions: {
            projectService: true,
            createDefaultProgram: true,
        },
    },

    rules: {
        quotes: ["error", "single", {
            avoidEscape: true,
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
        '@stylistic/indent': ['error', 4],
    },
}, {
    files: ["**/*.html"],
    plugins: {
        html,
    },
    language: "html/html",
    languageOptions: {
        // This tells the parser to treat {{ ... }} as template syntax,
        // so it won’t try to parse contents inside as regular HTML
        templateEngineSyntax: {
            "{{": "}}",
        },
    },
    rules: {
        "html/no-duplicate-class": "error",
        "html/indent": ["error", 4],
    }
}]);
