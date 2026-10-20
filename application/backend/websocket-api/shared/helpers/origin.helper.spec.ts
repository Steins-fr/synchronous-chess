import { describe, expect, test, vi } from 'vitest';
import { isAllowedOrigin } from './origin.helper';

describe('origin helper', () => {
    test.each([
        ['the app of the stage', 'https://sc-staging.steins.fr'],
        ['the game app served locally', 'http://localhost:4200'],
    ])('should allow a page of %s', (_case: string, origin: string) => {
        // Given
        vi.stubEnv('ALLOWED_ORIGINS', 'https://sc-staging.steins.fr,http://localhost:4200');

        // When / Then
        expect(isAllowedOrigin({ Origin: origin })).toBe(true);
    });

    test.each([
        ['a page of another domain', { Origin: 'https://attacker.test' }],
        ['a page of another port', { Origin: 'http://localhost:4201' }],
        ['a client out of a browser, without Origin', { 'User-Agent': 'curl/8.5.0' }],
        ['a request without headers', null],
    ])('should refuse %s', (_case: string, headers: Record<string, string> | null) => {
        // Given
        vi.stubEnv('ALLOWED_ORIGINS', 'https://sc-staging.steins.fr,http://localhost:4200');

        // When / Then
        expect(isAllowedOrigin(headers)).toBe(false);
    });

    test('should fail without the origins of the game app in the environment', () => {
        // Given
        vi.stubEnv('ALLOWED_ORIGINS', undefined);

        // When / Then
        expect(() => isAllowedOrigin({ Origin: 'https://sc-staging.steins.fr' })).toThrow('No ALLOWED_ORIGINS');
    });
});
