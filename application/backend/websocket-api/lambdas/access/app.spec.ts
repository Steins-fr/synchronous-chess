import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ACCESS_LOGIN_URL, ACCESS_SIGNING_KEY_PEM, stubAccessEnvironment } from '@testing/access';
import { anHttpEvent } from '@testing/api-mocks';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AccessResponse } from './access-response';
import type * as AccessLambda from './app';

/** The lambda loaded again, as by a cold start: it reads the signing key from SSM when it loads */
async function loadAccessLambda(): Promise<typeof AccessLambda> {
    vi.resetModules();
    return import('./app');
}

describe('access lambda', () => {
    const ssm = mockClient(SSMClient);

    beforeEach(() => {
        ssm.reset().on(GetParameterCommand).resolves({ Parameter: { Value: ACCESS_SIGNING_KEY_PEM } });
        stubAccessEnvironment();
        vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    });

    test('should start the login on its route', async () => {
        // Given
        const { handler } = await loadAccessLambda();

        // When
        const { statusCode, headers }: AccessResponse = await handler(anHttpEvent('GET /auth/login'));

        // Then
        expect(statusCode).toEqual(302);
        expect(headers['Location']).toMatch(new RegExp(`^${ ACCESS_LOGIN_URL }/oauth2/authorize\\?`));
    });

    test('should end the login on its route', async () => {
        // Given
        const { handler } = await loadAccessLambda();

        // When / Then: a callback without code
        expect((await handler(anHttpEvent('GET /auth/callback', 'error=access_denied'))).statusCode).toEqual(403);
    });

    test('should answer not found to a route without handler', async () => {
        // Given
        const { handler } = await loadAccessLambda();

        // When / Then
        expect(await handler(anHttpEvent('GET /rooms'))).toEqual({
            statusCode: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
            body: 'Not found',
        });
    });
});
