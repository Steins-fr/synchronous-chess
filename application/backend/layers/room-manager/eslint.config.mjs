import _import from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import stylistic from '@stylistic/eslint-plugin';
import { fixupPluginRules } from '@eslint/compat';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import sharedConfig from '../../eslint.config.mjs';

export default [
    {
        ignores: [
            'dist/*',
            'node_modules/*',
        ],
    },
    {
        plugins: {
            import: fixupPluginRules(_import),
            jsdoc,
            '@typescript-eslint': typescriptEslint,
            '@stylistic': stylistic,
        },

        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },

            parser: tsParser,
            ecmaVersion: 5,
            sourceType: 'module',

            parserOptions: {
                project: 'tsconfig.json',
            },
        },
        ...sharedConfig,
    }
];
