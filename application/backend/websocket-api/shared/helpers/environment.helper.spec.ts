import { describe, expect, test, vi } from 'vitest';
import { getManagementApiEndpoint } from './environment.helper';

describe('environment helper', () => {
    test.each([
        ['not set', undefined],
        ['empty', ''],
    ])('should reach the management API through the domain of the websocket API when the endpoint of the environment is %s', (_case: string, endpoint: string | undefined) => {
        // Given: whatever the environment running the specs sets
        vi.stubEnv('MANAGEMENT_API_ENDPOINT', endpoint);

        // When / Then
        expect(getManagementApiEndpoint('api.test')).toEqual('https://api.test');
    });

    test('should reach the management API through the endpoint of the environment when set', () => {
        // Given
        vi.stubEnv('MANAGEMENT_API_ENDPOINT', 'http://127.0.0.1:3001');

        // When / Then
        expect(getManagementApiEndpoint('api.test')).toEqual('http://127.0.0.1:3001');
    });

    test('should fail without endpoint in the environment nor domain name', () => {
        // Given
        vi.stubEnv('MANAGEMENT_API_ENDPOINT', undefined);

        // When / Then
        expect(() => getManagementApiEndpoint(undefined)).toThrow('No endpoint for the management API');
    });
});
