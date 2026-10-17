import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        // Read by the hashes of the IPs of the clients (source.helper)
        env: {
            SOURCE_HASH_SECRET: 'source-secret',
        },
        restoreMocks: true,
        // Each spec file starts PGlite in a hook, in a second alone: a worker by CPU compiling its WASM at once takes
        // longer than with a few, and times out on a machine of many CPUs
        maxWorkers: 8,
        hookTimeout: 30_000,
        unstubEnvs: true,
        coverage: {
            provider: 'v8',
            include: ['lambdas/**/*.ts', 'shared/**/*.ts'],
            exclude: ['**/*.spec.ts'],
            // Paths relative to `application`, the base directory of the SonarCloud analysis
            reporter: ['text-summary', 'html', ['lcov', { projectRoot: '../..' }]],
            thresholds: {
                statements: 100,
                branches: 100,
                functions: 100,
                lines: 100,
            },
        },
    },
    resolve: {
        alias: {
            '@database': path.resolve(import.meta.dirname, 'shared/database'),
            '@exceptions': path.resolve(import.meta.dirname, 'shared/exceptions'),
            '@helpers': path.resolve(import.meta.dirname, 'shared/helpers'),
            '@models': path.resolve(import.meta.dirname, 'shared/models'),
            '@protocol': path.resolve(import.meta.dirname, '../../shared/room-socket-protocol'),
            '@repositories': path.resolve(import.meta.dirname, 'shared/repositories'),
            '@services': path.resolve(import.meta.dirname, 'shared/services'),
            '@testing': path.resolve(import.meta.dirname, 'testing'),
        },
    },
});
