import { AccessCookies, signAccessCookies } from '@helpers/access-cookie.helper';
import { epochSeconds } from '@helpers/time.helper';
import { generateKeyPairSync, KeyObject, KeyPairKeyObjectResult } from 'node:crypto';
import { vi } from 'vitest';

/** The key pair of the access cookies of the specs, drawn once by spec file: no key is committed */
export const ACCESS_KEYS: KeyPairKeyObjectResult = generateKeyPairSync('rsa', { modulusLength: 2048 });
/** The private key as the owner writes it to its SSM parameter (openssl genrsa) */
export const ACCESS_SIGNING_KEY_PEM: string = ACCESS_KEYS.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
export const ACCESS_KEY_PAIR_ID: string = 'K2JCJMDEHXQW5F';
export const ACCESS_FRONT_URL: string = 'https://sc-test.steins.fr/';
/** All the files of the front */
export const ACCESS_RESOURCE: string = `${ ACCESS_FRONT_URL }*`;
export const ACCESS_SIGNING_KEY_PARAMETER: string = '/sc/test/access-signing-key';
export const ACCESS_COOKIE_DOMAIN: string = 'steins.fr';
export const ACCESS_LOGIN_URL: string = 'https://synchronous-chess-test.auth.eu-west-1.amazoncognito.com';
export const ACCESS_CLIENT_ID: string = 'access-client';
export const ACCESS_CALLBACK_URL: string = 'https://sc-api-test.steins.fr/auth/callback';

/** A public key as infrastructure/main.tf gives it to the lambdas: SPKI DER in base64 */
export function encodePublicKey(publicKey: KeyObject): string {
    return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

/** The environment infrastructure/main.tf gives the access lambda and the authorizers of a restricted stage */
export function stubAccessEnvironment(): void {
    vi.stubEnv('ACCESS_PUBLIC_KEY', encodePublicKey(ACCESS_KEYS.publicKey));
    vi.stubEnv('ACCESS_KEY_PAIR_ID', ACCESS_KEY_PAIR_ID);
    vi.stubEnv('ACCESS_FRONT_URL', ACCESS_FRONT_URL);
    vi.stubEnv('ACCESS_SIGNING_KEY_PARAMETER', ACCESS_SIGNING_KEY_PARAMETER);
    vi.stubEnv('ACCESS_COOKIE_DOMAIN', ACCESS_COOKIE_DOMAIN);
    vi.stubEnv('ACCESS_LOGIN_URL', ACCESS_LOGIN_URL);
    vi.stubEnv('ACCESS_CLIENT_ID', ACCESS_CLIENT_ID);
    vi.stubEnv('ACCESS_CALLBACK_URL', ACCESS_CALLBACK_URL);
}

/**
 * The access cookies of the specs, `name=value` each as the cookies of an event of the HTTP API: opening the front for an
 * hour unless told, some of them replaced
 */
export function accessCookies(expiresAt: number = epochSeconds() + 3600, replaced: Partial<AccessCookies> = {}): string[] {
    const cookies: AccessCookies = { ...signAccessCookies(ACCESS_KEYS.privateKey, ACCESS_KEY_PAIR_ID, ACCESS_RESOURCE, expiresAt), ...replaced };
    return Object.entries(cookies).map(([name, value]: [string, string]): string => `${ name }=${ value }`);
}
