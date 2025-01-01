import _import from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import stylistic from "@stylistic/eslint-plugin";
import { fixupPluginRules } from "@eslint/compat";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";

export default [
    {
        ignores: ["dist/*", "node_modules/*"],
    },
    {
        plugins: {
            import: fixupPluginRules(_import),
            jsdoc,
            "@typescript-eslint": typescriptEslint,
            "@stylistic": stylistic,
        },

        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },

            parser: tsParser,
            ecmaVersion: 5,
            sourceType: "module",

            parserOptions: {
                project: "tsconfig.json",
            },
        },
        files: ["**/*.ts"],
        rules: {
            "@typescript-eslint/array-type": [
                "error",
                {
                    default: "array",
                },
            ],
            "@typescript-eslint/no-explicit-any": "error",

            "@typescript-eslint/consistent-type-assertions": "error",
            "@typescript-eslint/dot-notation": "off",

            "@typescript-eslint/explicit-function-return-type": [
                "error",
                {
                    allowExpressions: false,
                    allowTypedFunctionExpressions: false,
                    allowHigherOrderFunctions: false,
                    allowDirectConstAssertionInArrowFunctions: true,
                    allowConciseArrowFunctionExpressionsStartingWithVoid: true,
                },
            ],

            "@typescript-eslint/explicit-member-accessibility": [
                "error",
                {
                    accessibility: "explicit",

                    overrides: {
                        accessors: "explicit",
                        constructors: "explicit",
                        parameterProperties: "explicit",
                    },
                },
            ],

            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],

            "@typescript-eslint/explicit-module-boundary-types": [
                "error",
                {
                    allowArgumentsExplicitlyTypedAsAny: true,
                    allowDirectConstAssertionInArrowFunctions: true,
                    allowHigherOrderFunctions: false,
                    allowTypedFunctionExpressions: false,
                },
            ],

            "@typescript-eslint/indent": "off",

            "@typescript-eslint/naming-convention": "off",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/no-empty-interface": "error",

            "@typescript-eslint/no-inferrable-types": [
                "off",
                {
                    ignoreParameters: true,
                },
            ],

            "@typescript-eslint/no-misused-new": "error",
            "@typescript-eslint/no-non-null-assertion": "error",

            "@typescript-eslint/no-shadow": [
                "error",
                {
                    hoist: "all",
                },
            ],

            "@typescript-eslint/no-unnecessary-type-assertion": "error",
            "@typescript-eslint/no-unused-expressions": "error",
            "@typescript-eslint/no-use-before-define": "error",
            "@typescript-eslint/no-var-requires": "off",
            "@typescript-eslint/prefer-readonly": "error",
            "@stylistic/quotes": ["error", "single"],
            "@stylistic/semi": ["error", "always"],
            "@stylistic/type-annotation-spacing": "error",

            "@typescript-eslint/typedef": [
                "error",
                {
                    parameter: true,
                    arrowParameter: true,
                },
            ],

            "@typescript-eslint/unified-signatures": "error",
            "arrow-body-style": "error",
            "arrow-parens": ["off", "always"],
            "brace-style": ["error", "1tbs"],
            "comma-dangle": "off",
            "constructor-super": "error",
            "dot-notation": "off",
            "eol-last": "error",
            eqeqeq: ["error", "smart"],
            "import/no-deprecated": "warn",

            "import/order": [
                "off",
                {
                    alphabetize: {
                        caseInsensitive: true,
                        order: "asc",
                    },

                    "newlines-between": "ignore",

                    groups: [
                        [
                            "builtin",
                            "external",
                            "internal",
                            "unknown",
                            "object",
                            "type",
                        ],
                        "parent",
                        ["sibling", "index"],
                    ],

                    distinctGroup: false,
                    pathGroupsExcludedImportTypes: [],

                    pathGroups: [
                        {
                            pattern: "./",

                            patternOptions: {
                                nocomment: true,
                                dot: true,
                            },

                            group: "sibling",
                            position: "before",
                        },
                        {
                            pattern: ".",

                            patternOptions: {
                                nocomment: true,
                                dot: true,
                            },

                            group: "sibling",
                            position: "before",
                        },
                        {
                            pattern: "..",

                            patternOptions: {
                                nocomment: true,
                                dot: true,
                            },

                            group: "parent",
                            position: "before",
                        },
                        {
                            pattern: "../",

                            patternOptions: {
                                nocomment: true,
                                dot: true,
                            },

                            group: "parent",
                            position: "before",
                        },
                    ],
                },
            ],

            indent: "off",
            "jsdoc/no-types": "error",
            "max-classes-per-file": "off",

            "max-len": [
                "off",
                {
                    code: 140,
                },
            ],

            "new-parens": "error",
            "no-bitwise": "error",
            "no-caller": "error",

            "no-console": [
                "error",
                {
                    allow: [
                        "log",
                        "warn",
                        "error",
                        "dir",
                        "timeLog",
                        "assert",
                        "clear",
                        "count",
                        "countReset",
                        "group",
                        "groupEnd",
                        "table",
                        "dirxml",
                        "groupCollapsed",
                        "Console",
                        "profile",
                        "profileEnd",
                        "timeStamp",
                        "context",
                        "createTask",
                    ],
                },
            ],

            "no-debugger": "error",
            "no-duplicate-imports": "error",
            "no-empty": "off",
            "no-empty-function": "off",
            "no-eval": "error",
            "no-fallthrough": "error",
            "no-irregular-whitespace": "error",
            "no-multiple-empty-lines": "off",
            "no-new-wrappers": "error",
            "no-restricted-imports": ["error", "rxjs/Rx"],
            "no-shadow": "off",
            "no-throw-literal": "error",
            "no-trailing-spaces": "error",
            "no-undef-init": "error",
            "no-unused-expressions": "off",
            "no-use-before-define": "off",
            "no-var": "error",
            "prefer-const": "error",
            "quote-props": ["error", "as-needed"],
            quotes: "off",
            radix: "error",
            semi: "off",
        },
    },
];
