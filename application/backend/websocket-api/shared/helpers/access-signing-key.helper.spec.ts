import { GetParameterCommand, ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import { ACCESS_KEYS, ACCESS_SIGNING_KEY_PARAMETER, ACCESS_SIGNING_KEY_PEM, encodePublicKey, stubAccessEnvironment } from '@testing/access';
import { mockClient } from 'aws-sdk-client-mock';
import { createPublicKey, generateKeyPairSync, KeyPairKeyObjectResult } from 'node:crypto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as AccessSigningKeyHelper from './access-signing-key.helper';

/** The helper loaded again, as by a cold start of the access lambda: it reads its key when it loads */
async function loadAccessSigningKeyHelper(): Promise<typeof AccessSigningKeyHelper> {
    vi.resetModules();
    return import('./access-signing-key.helper');
}

describe('access signing key helper', () => {
    const ssm = mockClient(SSMClient);

    beforeEach(() => {
        ssm.reset();
        stubAccessEnvironment();
    });

    test('should read the private key from its SSM parameter once, when it loads', async () => {
        // Given
        ssm.on(GetParameterCommand).resolves({ Parameter: { Value: ACCESS_SIGNING_KEY_PEM } });

        // When
        const { accessSigningKey } = await loadAccessSigningKeyHelper();

        // Then
        expect(accessSigningKey.type).toEqual('private');
        expect(encodePublicKey(createPublicKey(accessSigningKey))).toEqual(encodePublicKey(ACCESS_KEYS.publicKey));
        expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(1);
        expect(ssm.commandCalls(GetParameterCommand)[0]?.args[0].input).toEqual({ Name: ACCESS_SIGNING_KEY_PARAMETER, WithDecryption: true });
    });

    test('should fail to load without parameter in the environment', async () => {
        // Given
        vi.stubEnv('ACCESS_SIGNING_KEY_PARAMETER', undefined);

        // When / Then
        await expect(loadAccessSigningKeyHelper()).rejects.toThrow('No ACCESS_SIGNING_KEY_PARAMETER');
        expect(ssm.calls()).toHaveLength(0);
    });

    test('should fail to load when its parameter has no value', async () => {
        // Given
        ssm.on(GetParameterCommand).resolves({ Parameter: { Name: ACCESS_SIGNING_KEY_PARAMETER } });

        // When / Then
        await expect(loadAccessSigningKeyHelper()).rejects.toThrow(`No value in the SSM parameter ${ ACCESS_SIGNING_KEY_PARAMETER }`);
    });

    test('should fail to load when SSM does not read its parameter', async () => {
        // Given
        ssm.on(GetParameterCommand).rejects(new ParameterNotFound({ $metadata: {}, message: 'Parameter not found' }));

        // When / Then
        await expect(loadAccessSigningKeyHelper()).rejects.toThrow('Parameter not found');
    });

    test('should fail to load when its key is not the one of the public key of CloudFront: a rotation half done', async () => {
        // Given
        const other: KeyPairKeyObjectResult = generateKeyPairSync('rsa', { modulusLength: 2048 });
        ssm.on(GetParameterCommand).resolves({ Parameter: { Value: other.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString() } });

        // When / Then
        await expect(loadAccessSigningKeyHelper()).rejects.toThrow(`The key of the SSM parameter ${ ACCESS_SIGNING_KEY_PARAMETER } is not the one of ACCESS_PUBLIC_KEY`);
    });
});
