import { AccessKey, environmentAccessKey, signAccessCookies } from '@helpers/access-cookie.helper';
import { accessSigningKey } from '@helpers/access-signing-key.helper';
import { parseCookies, serializeCookie } from '@helpers/cookie.helper';
import { getAccessCallbackUrl, getAccessClientId, getAccessCookieDomain, getAccessFrontUrl, getAccessLoginUrl } from '@helpers/environment.helper';
import { epochSeconds } from '@helpers/time.helper';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { AccessResponse, redirection, textResponse } from '../access-response';
import { LOGIN_COOKIE } from './login-handler';

/** In seconds, a week: the time the owner plays without signing in again, on each device */
export const ACCESS_DURATION: number = 7 * 24 * 3600;

const REFUSED: string = 'Access refused.';

/**
 * Ends the login of the owner: the code Cognito sends back is exchanged at its token endpoint, with the verifier of the
 * login, then the access cookies are set on the domain of the stage, sent to its front and its APIs (same site), and the
 * owner is sent to the front. The tokens of Cognito are not kept, nor checked: they come from its token endpoint over
 * HTTPS (OIDC Core 3.1.3.7), and the user pool has its owner only. Refused (403) without code (a login cancelled), without
 * the cookie of the login, or with another state. Never logs the code, the state, the verifier or the tokens
 */
export async function callbackHandler(event: APIGatewayProxyEventV2): Promise<AccessResponse> {
    const query: URLSearchParams = new URLSearchParams(event.rawQueryString);
    const code: string | null = query.get('code');
    const [state, verifier]: readonly (string | undefined)[] = (parseCookies(event.cookies).get(LOGIN_COOKIE) ?? '').split('.');

    if (code === null || verifier === undefined || query.get('state') !== state) {
        console.warn('Login refused: no code, or not the state of the login');
        return textResponse(403, REFUSED);
    }

    const tokens: Response = await fetch(`${ getAccessLoginUrl() }/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: getAccessClientId(),
            code,
            redirect_uri: getAccessCallbackUrl(),
            code_verifier: verifier,
        }),
    });

    if (!tokens.ok) {
        console.warn(`Login refused: the token endpoint answered ${ tokens.status }`);
        return textResponse(403, REFUSED);
    }

    const { keyPairId, resource }: AccessKey = environmentAccessKey();
    const domain: string = getAccessCookieDomain();
    const cookies: string[] = Object.entries(signAccessCookies(accessSigningKey, keyPairId, resource, epochSeconds() + ACCESS_DURATION))
        .map(([name, value]: [string, string]): string => serializeCookie(name, value, { domain, maxAge: ACCESS_DURATION }));

    return redirection(getAccessFrontUrl(), [...cookies, serializeCookie(LOGIN_COOKIE, '', { maxAge: 0 })]);
}
