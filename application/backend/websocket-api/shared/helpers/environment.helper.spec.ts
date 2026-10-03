import { describe, expect, test, vi } from 'vitest';
import { getManagementApiEndpoint } from './environment.helper';

describe('environment helper', () => {
    test('should reach the management API through the domain of the websocket API', () => {
        expect(getManagementApiEndpoint('api.test')).toEqual('https://api.test');
    });

    test('should reach the management API through the endpoint of the environment when set', () => {
        // Given
        vi.stubEnv('MANAGEMENT_API_ENDPOINT', 'http://localhost:3001');

        // When / Then
        expect(getManagementApiEndpoint('api.test')).toEqual('http://localhost:3001');
        vi.unstubAllEnvs();
    });
});
