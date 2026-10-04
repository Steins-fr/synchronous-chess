import { defineConfig, devices } from '@playwright/test';

/**
 * The end-to-end tests of the rooms: real browsers connected to each other through WebRTC, against the local API.
 * Starts the local API and the game app, unless already running.
 */
export default defineConfig({
    testDir: 'e2e',
    testMatch: '**/*.e2e.ts',
    // The scenarios wait for the departures and reconnections of the participants
    timeout: 120_000,
    expect: { timeout: 30_000 },
    // Several browsers per test, connected through WebRTC: one test at a time keeps their timings steady
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: 'http://localhost:4200',
        trace: 'retain-on-failure',
        ...devices['Desktop Chrome'],
    },
    webServer: [
        {
            command: 'npm run serve:local',
            cwd: '../../backend/websocket-api',
            port: 3001,
            reuseExistingServer: true,
            timeout: 120_000,
            // The logs of the servers would bury the results: run them apart to read them
            stdout: 'ignore',
            stderr: 'ignore',
        },
        {
            command: 'npm run serve:local',
            url: 'http://localhost:4200',
            reuseExistingServer: true,
            timeout: 180_000,
            stdout: 'ignore',
            stderr: 'ignore',
        },
    ],
});
