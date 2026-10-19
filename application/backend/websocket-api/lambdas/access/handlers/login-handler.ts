import { serializeCookie } from '@helpers/cookie.helper';
import { getAccessCallbackUrl, getAccessClientId, getAccessLoginUrl } from '@helpers/environment.helper';
import { createHash, randomBytes } from 'node:crypto';
import { AccessResponse, redirection } from '../access-response';

/**
 * The state and the PKCE verifier of a login, `<state>.<verifier>`, until Cognito calls back: set by the API host alone
 * (`__Host-`), no other host of the domain can set it in its place
 */
export const LOGIN_COOKIE: string = '__Host-sc-access-login';
/** In seconds: the time to sign in on the managed login */
const LOGIN_DURATION: number = 600;

/** 32 random bytes in base64url: a state, a verifier */
function randomValue(): string {
    return randomBytes(32).toString('base64url');
}

/**
 * Starts the login of the owner: the authorization code flow of the managed login of Cognito, with PKCE (the app client
 * has no secret), the callback checking the state of the cookie against the one Cognito sends back
 */
export function loginHandler(): Promise<AccessResponse> {
    const state: string = randomValue();
    const verifier: string = randomValue();
    const authorize: URL = new URL(`${ getAccessLoginUrl() }/oauth2/authorize`);

    authorize.search = new URLSearchParams({
        response_type: 'code',
        client_id: getAccessClientId(),
        redirect_uri: getAccessCallbackUrl(),
        scope: 'openid',
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
    }).toString();

    return Promise.resolve(redirection(authorize.toString(), [serializeCookie(LOGIN_COOKIE, `${ state }.${ verifier }`, { maxAge: LOGIN_DURATION })]));
}
