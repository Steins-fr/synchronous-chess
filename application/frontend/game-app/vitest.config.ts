/// <reference types="vitest" />

import path from 'node:path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    return {
        plugins: [],
        test: {
            globals: true,
            environment: 'jsdom',
            setupFiles: ['./test-setup.ts'],
            reporters: ['default'],
        },
        define: {
            'import.meta.vitest': mode !== 'production',
        },
        resolve: {
            alias: {
                '@app': path.resolve(__dirname, 'src/app'),
                '@testing': path.resolve(__dirname, 'src/testing'),
                '@environments': path.resolve(__dirname, 'src/environments'),
            }
        }
    };
});
