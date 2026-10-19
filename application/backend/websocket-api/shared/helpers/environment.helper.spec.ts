import { describe, expect, test, vi } from 'vitest';
import {
    getAccessCallbackUrl,
    getAccessClientId,
    getAccessCookieDomain,
    getAccessFrontUrl,
    getAccessKeyPairId,
    getAccessLoginUrl,
    getAccessPublicKey,
    getAccessSigningKeyParameter,
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
        ['ACCESS_PUBLIC_KEY', getAccessPublicKey, 'the public key of the access cookies'],
        ['ACCESS_KEY_PAIR_ID', getAccessKeyPairId, 'the ID of the public key of the access cookies in CloudFront'],
        ['ACCESS_FRONT_URL', getAccessFrontUrl, 'the URL of the front the access cookies open'],
        ['ACCESS_SIGNING_KEY_PARAMETER', getAccessSigningKeyParameter, 'the SSM parameter of the key signing the access cookies'],
        ['ACCESS_COOKIE_DOMAIN', getAccessCookieDomain, 'the domain of the access cookies'],
        ['ACCESS_LOGIN_URL', getAccessLoginUrl, 'the managed login of Cognito'],
        ['ACCESS_CLIENT_ID', getAccessClientId, 'the app client of the login'],
        ['ACCESS_CALLBACK_URL', getAccessCallbackUrl, 'the callback of the login'],
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

    test('should give the access of a restricted stage of the environment', () => {
        // Given
        vi.stubEnv('ACCESS_PUBLIC_KEY', 'MIIBIjAN');
        vi.stubEnv('ACCESS_KEY_PAIR_ID', 'K2JCJMDEHXQW5F');
        vi.stubEnv('ACCESS_FRONT_URL', 'https://sc-dev.steins.fr/');
        vi.stubEnv('ACCESS_SIGNING_KEY_PARAMETER', '/sc/dev/access-signing-key');
        vi.stubEnv('ACCESS_COOKIE_DOMAIN', 'steins.fr');
        vi.stubEnv('ACCESS_LOGIN_URL', 'https://synchronous-chess-dev.auth.eu-west-1.amazoncognito.com');
        vi.stubEnv('ACCESS_CLIENT_ID', 'client');
        vi.stubEnv('ACCESS_CALLBACK_URL', 'https://sc-api-dev.steins.fr/auth/callback');

        // When / Then
        expect([
            getAccessPublicKey(),
            getAccessKeyPairId(),
            getAccessFrontUrl(),
            getAccessSigningKeyParameter(),
            getAccessCookieDomain(),
            getAccessLoginUrl(),
            getAccessClientId(),
            getAccessCallbackUrl(),
        ]).toEqual([
            'MIIBIjAN',
            'K2JCJMDEHXQW5F',
            'https://sc-dev.steins.fr/',
            '/sc/dev/access-signing-key',
            'steins.fr',
            'https://synchronous-chess-dev.auth.eu-west-1.amazoncognito.com',
            'client',
            'https://sc-api-dev.steins.fr/auth/callback',
        ]);
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
