import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        // Read by the repositories when the lambdas load
        env: {
            TABLE_NAME_CONNECTIONS: 'connection',
            TABLE_NAME_ROOMS: 'room',
        },
        restoreMocks: true,
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
