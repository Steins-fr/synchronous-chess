import { getAccessFrontUrl, getAccessKeyPairId, getAccessPublicKey } from '@helpers/environment.helper';
import { createPublicKey, KeyObject, sign, verify } from 'node:crypto';

/**
 * The signed cookies of CloudFront, of a custom policy: the distribution of a restricted stage serves its files to the
 * requests sending them, its authorizers check the same ones
 */
export enum AccessCookie {
    POLICY = 'CloudFront-Policy',
    SIGNATURE = 'CloudFront-Signature',
    KEY_PAIR_ID = 'CloudFront-Key-Pair-Id',
    HASH_ALGORITHM = 'CloudFront-Hash-Algorithm',
}

/** The value of the access cookies, by their name */
export type AccessCookies = Readonly<Record<AccessCookie, string>>;

/** What checks the access cookies of a stage */
export interface AccessKey {
    publicKey: KeyObject;
    /** The ID of the public key in CloudFront */
    keyPairId: string;
    /** The URL of the front followed by the wildcard of CloudFront: all its files */
    resource: string;
}

interface AccessPolicy {
    Statement: [{ Resource: string; Condition: { DateLessThan: { 'AWS:EpochTime': number } } }];
}

// Without its cookie, CloudFront checks a signature of SHA-1
const SIGNATURE_HASH: string = 'SHA256';

/** The base64 of CloudFront, valid in a URL: `+` `=` `/` replaced by `-` `_` `~` */
function toCloudFrontBase64(data: Buffer): string {
    return data.toString('base64').replaceAll('+', '-').replaceAll('=', '_').replaceAll('/', '~');
}

function fromCloudFrontBase64(text: string): Buffer {
    return Buffer.from(text.replaceAll('-', '+').replaceAll('_', '=').replaceAll('~', '/'), 'base64');
}

/** The policy opening the files of the resource until it expires, in JSON without spaces as CloudFront reads it */
function accessPolicy(resource: string, expiresAt: number): string {
    return JSON.stringify({ Statement: [{ Resource: resource, Condition: { DateLessThan: { 'AWS:EpochTime': expiresAt } } }] } satisfies AccessPolicy);
}

/**
 * The access key of the environment of the lambda, read at each request: the authorizers of a restricted stage
 * @throws {Error} when the environment does not give it, or gives a public key that is not one
 */
export function environmentAccessKey(): AccessKey {
    return {
        publicKey: createPublicKey({ key: Buffer.from(getAccessPublicKey(), 'base64'), format: 'der', type: 'spki' }),
        keyPairId: getAccessKeyPairId(),
        resource: `${ getAccessFrontUrl() }*`,
    };
}

/** The cookies opening the files of the resource until they expire (epoch seconds), signed by the private key */
export function signAccessCookies(privateKey: KeyObject, keyPairId: string, resource: string, expiresAt: number): AccessCookies {
    const policy: Buffer = Buffer.from(accessPolicy(resource, expiresAt));

    return {
        [AccessCookie.POLICY]: toCloudFrontBase64(policy),
        [AccessCookie.SIGNATURE]: toCloudFrontBase64(sign('sha256', policy, privateKey)),
        [AccessCookie.KEY_PAIR_ID]: keyPairId,
        [AccessCookie.HASH_ALGORITHM]: SIGNATURE_HASH,
    };
}

/**
 * Whether the cookies of a request open the stage, as CloudFront tells: signed by the private key of the access key, for
 * its resource, not expired (epoch seconds). Only a policy signed by the access lambda is read
 */
export function isAccessGranted(cookies: ReadonlyMap<string, string>, { publicKey, keyPairId, resource }: AccessKey, now: number): boolean {
    const policy: string | undefined = cookies.get(AccessCookie.POLICY);
    const signature: string | undefined = cookies.get(AccessCookie.SIGNATURE);

    if (policy === undefined || signature === undefined || cookies.get(AccessCookie.KEY_PAIR_ID) !== keyPairId || cookies.get(AccessCookie.HASH_ALGORITHM) !== SIGNATURE_HASH) {
        return false;
    }

    const policyText: Buffer = fromCloudFrontBase64(policy);

    if (!verify('sha256', policyText, publicKey, fromCloudFrontBase64(signature))) {
        return false;
    }

    const { Statement: [{ Resource: grantedResource, Condition: { DateLessThan: { 'AWS:EpochTime': expiresAt } } }] }: AccessPolicy = JSON.parse(policyText.toString());
    return grantedResource === resource && expiresAt > now;
}
