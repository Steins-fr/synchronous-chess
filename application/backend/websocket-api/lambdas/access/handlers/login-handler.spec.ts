import { ACCESS_CALLBACK_URL, ACCESS_CLIENT_ID, ACCESS_LOGIN_URL, stubAccessEnvironment } from '@testing/access';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { AccessResponse } from '../access-response';
import { loginHandler } from './login-handler';

/** The state and the verifier the login keeps in its cookie, its only one */
function loginOf({ cookies }: AccessResponse): { state: string; verifier: string } {
    const [state, verifier] = (cookies?.[0] ?? '').split(';')[0].replace('__Host-sc-access-login=', '').split('.');
    return { state, verifier };
}

describe('login handler', () => {
    beforeEach(() => {
        stubAccessEnvironment();
    });

    test('should send the owner to the managed login, with a state and the challenge of a verifier its cookie keeps', async () => {
        // When
        const response: AccessResponse = await loginHandler();

        // Then
        const { state, verifier } = loginOf(response);
        const authorize: URL = new URL(response.headers['Location']);
        expect(response.statusCode).toEqual(302);
        expect(`${ authorize.origin }${ authorize.pathname }`).toEqual(`${ ACCESS_LOGIN_URL }/oauth2/authorize`);
        expect(Object.fromEntries(authorize.searchParams)).toEqual({
            response_type: 'code',
            client_id: ACCESS_CLIENT_ID,
            redirect_uri: ACCESS_CALLBACK_URL,
            scope: 'openid',
            state,
            code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            code_challenge_method: 'S256',
        });
        expect(response.headers['Cache-Control']).toEqual('no-store');
    });

    test('should keep the state and the verifier in a cookie of the API host alone, for the time to sign in', async () => {
        // When
        const { cookies }: AccessResponse = await loginHandler();

        // Then: 32 random bytes each, in base64url
        expect(cookies).toEqual([expect.stringMatching(/^__Host-sc-access-login=[\w-]{43}\.[\w-]{43}; Path=\/; Max-Age=600; Secure; HttpOnly; SameSite=Lax$/)]);
    });

    test('should draw another state and verifier at each login', async () => {
        // When
        const first = loginOf(await loginHandler());
        const second = loginOf(await loginHandler());

        // Then
        expect(second.state).not.toEqual(first.state);
        expect(second.verifier).not.toEqual(first.verifier);
        expect(first.verifier).not.toEqual(first.state);
    });
});
