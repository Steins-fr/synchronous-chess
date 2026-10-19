import { epochSeconds } from '@helpers/time.helper';
import { ACCESS_FRONT_URL, ACCESS_KEY_PAIR_ID, ACCESS_KEYS, ACCESS_RESOURCE, accessCookies, encodePublicKey, stubAccessEnvironment } from '@testing/access';
import { generateKeyPairSync, KeyPairKeyObjectResult, verify } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { AccessCookie, AccessCookies, AccessKey, environmentAccessKey, isAccessGranted, signAccessCookies } from './access-cookie.helper';
import { parseCookies } from './cookie.helper';

const NOW: number = 1_800_000_000;
const ACCESS_KEY: AccessKey = { publicKey: ACCESS_KEYS.publicKey, keyPairId: ACCESS_KEY_PAIR_ID, resource: ACCESS_RESOURCE };

/** The base64 of CloudFront, read back */
function decode(value: string): Buffer {
    return Buffer.from(value.replaceAll('-', '+').replaceAll('_', '=').replaceAll('~', '/'), 'base64');
}

/** Whether the cookies, `name=value` each, open the front at the given time */
function isGranted(cookies: readonly string[], now: number = NOW, accessKey: AccessKey = ACCESS_KEY): boolean {
    return isAccessGranted(parseCookies(cookies), accessKey, now);
}

describe('access cookie helper', () => {
    test('should sign the policy opening the files of the front until the cookies expire, with SHA-256', () => {
        // When
        const cookies: AccessCookies = signAccessCookies(ACCESS_KEYS.privateKey, ACCESS_KEY_PAIR_ID, ACCESS_RESOURCE, NOW);

        // Then: the policy as CloudFront reads it, without spaces
        const policy: Buffer = decode(cookies[AccessCookie.POLICY]);
        expect(policy.toString()).toEqual(`{"Statement":[{"Resource":"${ ACCESS_RESOURCE }","Condition":{"DateLessThan":{"AWS:EpochTime":${ NOW }}}}]}`);
        expect(verify('sha256', policy, ACCESS_KEYS.publicKey, decode(cookies[AccessCookie.SIGNATURE]))).toBe(true);
        expect(cookies[AccessCookie.KEY_PAIR_ID]).toEqual(ACCESS_KEY_PAIR_ID);
        expect(cookies[AccessCookie.HASH_ALGORITHM]).toEqual('SHA256');
    });

    test('should encode the policy and the signature in the base64 of CloudFront, valid in a cookie', () => {
        // Given: a resource whose policy holds + / and = in base64
        const resource: string = 'https://sc-test.steins.fr/???>>>*';
        const base64: string = Buffer.from(JSON.stringify({ Statement: [{ Resource: resource, Condition: { DateLessThan: { 'AWS:EpochTime': NOW } } }] })).toString('base64');
        expect([base64.includes('+'), base64.includes('/'), base64.endsWith('=')]).toEqual([true, true, true]);

        // When
        const cookies: AccessCookies = signAccessCookies(ACCESS_KEYS.privateKey, ACCESS_KEY_PAIR_ID, resource, NOW);

        // Then: the signature of 256 bytes padded too
        expect(cookies[AccessCookie.POLICY]).toMatch(/^[A-Za-z0-9\-_~]+$/);
        expect(cookies[AccessCookie.SIGNATURE]).toMatch(/^[A-Za-z0-9\-_~]+__$/);
        expect(decode(cookies[AccessCookie.POLICY]).toString()).toContain(`"Resource":"${ resource }"`);
    });

    test('should open the front with the cookies it signed, until they expire', () => {
        // Given
        const cookies: string[] = accessCookies(NOW + 60);

        // When / Then
        expect(isGranted(cookies)).toBe(true);
        expect(isGranted(cookies, NOW + 59)).toBe(true);
        expect(isGranted(cookies, NOW + 60)).toBe(false);
    });

    test.each([
        ['the policy', AccessCookie.POLICY],
        ['the signature', AccessCookie.SIGNATURE],
        ['the key pair ID', AccessCookie.KEY_PAIR_ID],
        ['the hash algorithm', AccessCookie.HASH_ALGORITHM],
    ])('should refuse the cookies without %s', (_case: string, missing: AccessCookie) => {
        // Given
        const cookies: string[] = accessCookies(NOW + 60).filter((cookie: string): boolean => !cookie.startsWith(`${ missing }=`));

        // When / Then
        expect(isGranted(cookies)).toBe(false);
    });

    test('should refuse the cookies of another key pair ID', () => {
        expect(isGranted(accessCookies(NOW + 60, { [AccessCookie.KEY_PAIR_ID]: 'K3OTHERKEYPAIR' }))).toBe(false);
    });

    test('should refuse the cookies of a signature of SHA-1, which CloudFront checks without the hash algorithm', () => {
        expect(isGranted(accessCookies(NOW + 60, { [AccessCookie.HASH_ALGORITHM]: 'SHA1' }))).toBe(false);
    });

    test('should refuse a policy changed after its signature: a later expiry', () => {
        // Given
        const [later] = Object.values(signAccessCookies(ACCESS_KEYS.privateKey, ACCESS_KEY_PAIR_ID, ACCESS_RESOURCE, NOW + 3600));

        // When / Then
        expect(isGranted(accessCookies(NOW - 60, { [AccessCookie.POLICY]: later }))).toBe(false);
    });

    test('should refuse a signature of another key', () => {
        // Given
        const other: KeyPairKeyObjectResult = generateKeyPairSync('rsa', { modulusLength: 2048 });
        const cookies: AccessCookies = signAccessCookies(other.privateKey, ACCESS_KEY_PAIR_ID, ACCESS_RESOURCE, NOW + 60);

        // When / Then
        expect(isGranted(accessCookies(NOW + 60, { [AccessCookie.SIGNATURE]: cookies[AccessCookie.SIGNATURE] }))).toBe(false);
        expect(isGranted(accessCookies(NOW + 60), NOW, { ...ACCESS_KEY, publicKey: other.publicKey })).toBe(false);
    });

    test('should refuse a signature which is not one', () => {
        expect(isGranted(accessCookies(NOW + 60, { [AccessCookie.SIGNATURE]: 'not~a~signature' }))).toBe(false);
    });

    test('should refuse the cookies of another front, signed by the same key', () => {
        // Given
        const cookies: AccessCookies = signAccessCookies(ACCESS_KEYS.privateKey, ACCESS_KEY_PAIR_ID, 'https://sc-other.steins.fr/*', NOW + 60);

        // When / Then
        expect(isGranted(accessCookies(NOW + 60, cookies))).toBe(false);
    });

    test('should give the access key of the environment: its public key, its ID and all the files of the front', () => {
        // Given
        stubAccessEnvironment();

        // When
        const { publicKey, keyPairId, resource }: AccessKey = environmentAccessKey();

        // Then
        expect(encodePublicKey(publicKey)).toEqual(encodePublicKey(ACCESS_KEYS.publicKey));
        expect([keyPairId, resource]).toEqual([ACCESS_KEY_PAIR_ID, `${ ACCESS_FRONT_URL }*`]);
        expect(isAccessGranted(parseCookies(accessCookies()), environmentAccessKey(), epochSeconds())).toBe(true);
    });

    test('should fail on a public key which is not one', () => {
        // Given
        stubAccessEnvironment();
        vi.stubEnv('ACCESS_PUBLIC_KEY', 'bm90IGEga2V5');

        // When / Then
        expect(() => environmentAccessKey()).toThrow();
    });
});
