import { describe, expect, test, vi } from 'vitest';
import {
    getDatabaseName,
    getDatabaseResourceArn,
    getDatabaseSecretArn,
    getManagementApiEndpoint,
    getSourceHashSecret,
    getSourceHashSecretParameter,
} from './environment.helper';

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

    test.each([
        ['DATABASE_RESOURCE_ARN', getDatabaseResourceArn, 'the ARN of the Aurora cluster'],
        ['DATABASE_SECRET_ARN', getDatabaseSecretArn, 'the ARN of the secret of the Aurora cluster'],
        ['DATABASE_NAME', getDatabaseName, 'the database of the Aurora cluster'],
        ['SOURCE_HASH_SECRET_PARAMETER', getSourceHashSecretParameter, 'the SSM parameter of the key of the hashes of the IPs'],
    ])('should fail at once without %s in the environment', (variable: string, setting: () => string, purpose: string) => {
        // Given
        vi.stubEnv(variable, undefined);

        // When / Then
        expect(setting).toThrow(`No ${ variable }: ${ purpose }`);
    });

    test('should give the database of the environment', () => {
        // Given
        vi.stubEnv('DATABASE_RESOURCE_ARN', 'arn:aws:rds:eu-west-1:123456789012:cluster:sc-dev');
        vi.stubEnv('DATABASE_SECRET_ARN', 'arn:aws:secretsmanager:eu-west-1:123456789012:secret:sc-dev');
        vi.stubEnv('DATABASE_NAME', 'synchronous_chess');

        // When / Then
        expect([getDatabaseResourceArn(), getDatabaseSecretArn(), getDatabaseName()]).toEqual([
            'arn:aws:rds:eu-west-1:123456789012:cluster:sc-dev',
            'arn:aws:secretsmanager:eu-west-1:123456789012:secret:sc-dev',
            'synchronous_chess',
        ]);
    });

    test('should give the parameter of the key of the hashes of the IPs of the environment', () => {
        // Given
        vi.stubEnv('SOURCE_HASH_SECRET_PARAMETER', '/sc/dev/source-hash-secret');

        // When / Then
        expect(getSourceHashSecretParameter()).toEqual('/sc/dev/source-hash-secret');
    });

    test('should give the key of the hashes of the IPs of the environment, only when set', () => {
        // Given: the key of the environment running the specs
        const key: string | undefined = getSourceHashSecret();
        vi.stubEnv('SOURCE_HASH_SECRET', '');

        // When / Then
        expect(key).toEqual('source-secret');
        expect(getSourceHashSecret()).toBeUndefined();
    });
});
