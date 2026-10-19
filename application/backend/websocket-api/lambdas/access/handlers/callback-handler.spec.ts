import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { environmentAccessKey, isAccessGranted } from '@helpers/access-cookie.helper';
import { parseCookies } from '@helpers/cookie.helper';
import { epochSeconds } from '@helpers/time.helper';
import { ACCESS_CALLBACK_URL, ACCESS_CLIENT_ID, ACCESS_FRONT_URL, ACCESS_LOGIN_URL, ACCESS_SIGNING_KEY_PEM, stubAccessEnvironment } from '@testing/access';
import { anHttpEvent } from '@testing/api-mocks';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AccessResponse } from '../access-response';
import type * as CallbackHandler from './callback-handler';

const LOGIN_COOKIE: string = '__Host-sc-access-login=the-state.the-verifier';
const REFUSED: AccessResponse = { statusCode: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: 'Access refused.' };

/** The handler loaded again, as by a cold start of the access lambda: it reads the signing key from SSM when it loads */
async function loadCallbackHandler(): Promise<typeof CallbackHandler> {
    vi.resetModules();
    return import('./callback-handler');
}

/** The callback of Cognito, with the query it sends and the cookies of the browser */
function aCallback(rawQueryString: string, cookies?: string[]): ReturnType<typeof anHttpEvent> {
    return anHttpEvent('GET /auth/callback', rawQueryString, cookies);
}

describe('callback handler', () => {
    const ssm = mockClient(SSMClient);

    beforeEach(() => {
        ssm.reset().on(GetParameterCommand).resolves({ Parameter: { Value: ACCESS_SIGNING_KEY_PEM } });
        stubAccessEnvironment();
        vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    });

    test('should exchange the code at the token endpoint, with the verifier of the login', async () => {
        // Given
        const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
        const { callbackHandler } = await loadCallbackHandler();

        // When
        await callbackHandler(aCallback('code=the-code&state=the-state', ['theme=dark', LOGIN_COOKIE]));

        // Then
        expect(fetch).toHaveBeenCalledOnce();
        const [url, init] = fetch.mock.calls[0];
        expect(url).toEqual(`${ ACCESS_LOGIN_URL }/oauth2/token`);
        expect(init?.method).toEqual('POST');
        expect(init?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
        expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
            grant_type: 'authorization_code',
            client_id: ACCESS_CLIENT_ID,
            code: 'the-code',
            redirect_uri: ACCESS_CALLBACK_URL,
            code_verifier: 'the-verifier',
        });
    });

    test('should set the access cookies of the domain for a week, delete the cookie of the login and send the owner to the front', async () => {
        // Given
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
        const { callbackHandler, ACCESS_DURATION } = await loadCallbackHandler();

        // When
        const { statusCode, headers, cookies = [] }: AccessResponse = await callbackHandler(aCallback('code=the-code&state=the-state', [LOGIN_COOKIE]));

        // Then
        expect([statusCode, headers]).toEqual([302, { Location: ACCESS_FRONT_URL, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }]);
        expect(ACCESS_DURATION).toEqual(604_800);
        expect(cookies).toEqual([
            expect.stringMatching(/^CloudFront-Policy=[\w~-]+; Domain=steins\.fr; Path=\/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax$/),
            expect.stringMatching(/^CloudFront-Signature=[\w~-]+; Domain=steins\.fr; Path=\/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax$/),
            'CloudFront-Key-Pair-Id=K2JCJMDEHXQW5F; Domain=steins.fr; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax',
            'CloudFront-Hash-Algorithm=SHA256; Domain=steins.fr; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax',
            '__Host-sc-access-login=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax',
        ]);

        // Then: the cookies open the front for a week
        const sent: ReadonlyMap<string, string> = parseCookies(cookies.map((cookie: string): string => cookie.split(';')[0]));
        expect(isAccessGranted(sent, environmentAccessKey(), epochSeconds() + ACCESS_DURATION - 60)).toBe(true);
        expect(isAccessGranted(sent, environmentAccessKey(), epochSeconds() + ACCESS_DURATION + 60)).toBe(false);
    });

    test.each([
        ['no code, the login cancelled', 'error=access_denied&state=the-state', [LOGIN_COOKIE]],
        ['no cookie of the login', 'code=the-code&state=the-state', undefined],
        ['a cookie of the login without verifier', 'code=the-code&state=the-state', ['__Host-sc-access-login=the-state']],
        ['another state', 'code=the-code&state=another-state', [LOGIN_COOKIE]],
        ['no state', 'code=the-code', [LOGIN_COOKIE]],
    ])('should refuse a callback with %s, without exchanging its code', async (_case: string, rawQueryString: string, cookies: string[] | undefined) => {
        // Given
        const fetch = vi.spyOn(globalThis, 'fetch');
        const { callbackHandler } = await loadCallbackHandler();

        // When / Then
        expect(await callbackHandler(aCallback(rawQueryString, cookies))).toEqual(REFUSED);
        expect(fetch).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledExactlyOnceWith('Login refused: no code, or not the state of the login');
    });

    test('should refuse a code the token endpoint refuses', async () => {
        // Given
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));
        const { callbackHandler } = await loadCallbackHandler();

        // When / Then
        expect(await callbackHandler(aCallback('code=the-code&state=the-state', [LOGIN_COOKIE]))).toEqual(REFUSED);
        expect(console.warn).toHaveBeenCalledExactlyOnceWith('Login refused: the token endpoint answered 400');
    });

    test('should fail when the token endpoint does not answer', async () => {
        // Given
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
        const { callbackHandler } = await loadCallbackHandler();

        // When / Then
        await expect(callbackHandler(aCallback('code=the-code&state=the-state', [LOGIN_COOKIE]))).rejects.toThrow('fetch failed');
    });
});
