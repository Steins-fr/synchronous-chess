import { GetParameterCommand, ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { createHash, createHmac } from 'node:crypto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as SourceHelper from './source.helper';

const PARAMETER = '/sc/test/source-hash-secret';

/** The helper loaded again, as by a cold start of the lambda: it reads its key when it loads */
async function loadSourceHelper(): Promise<typeof SourceHelper> {
    vi.resetModules();
    return import('./source.helper');
}

describe('source helper', () => {
    const ssm = mockClient(SSMClient);

    beforeEach(() => {
        ssm.reset();
    });

    test('should hash an IP shortly, the same for a same IP only', async () => {
        // Given: the key of the environment running the specs
        const { hashSource } = await loadSourceHelper();

        // When
        const hash: string = hashSource('203.0.113.7');

        // Then
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
        expect(hashSource('203.0.113.7')).toEqual(hash);
        expect(hashSource('203.0.113.8')).not.toEqual(hash);
        expect(ssm.calls()).toHaveLength(0);
    });

    test('should hash an IP with the secret: not found again without it', async () => {
        // Given
        const hash: string = (await loadSourceHelper()).hashSource('203.0.113.7');
        vi.stubEnv('SOURCE_HASH_SECRET', 'another-secret');

        // When / Then
        expect((await loadSourceHelper()).hashSource('203.0.113.7')).not.toEqual(hash);
        expect(hash).not.toEqual(createHash('sha256').update('203.0.113.7').digest('hex').slice(0, 16));
    });

    test('should read the key from its SSM parameter once, without key in the environment', async () => {
        // Given: the environment of sendmessage on AWS
        vi.stubEnv('SOURCE_HASH_SECRET', undefined);
        vi.stubEnv('SOURCE_HASH_SECRET_PARAMETER', PARAMETER);
        ssm.on(GetParameterCommand).resolves({ Parameter: { Value: 'parameter-secret' } });

        // When
        const { hashSource } = await loadSourceHelper();

        // Then
        expect(hashSource('203.0.113.7')).toEqual(createHmac('sha256', 'parameter-secret').update('203.0.113.7').digest('hex').slice(0, 16));
        expect(hashSource('203.0.113.8')).not.toEqual(hashSource('203.0.113.7'));
        expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(1);
        expect(ssm.commandCalls(GetParameterCommand)[0]?.args[0].input).toEqual({ Name: PARAMETER, WithDecryption: true });
    });

    test('should fail to load without key nor parameter in the environment', async () => {
        // Given
        vi.stubEnv('SOURCE_HASH_SECRET', '');
        vi.stubEnv('SOURCE_HASH_SECRET_PARAMETER', undefined);

        // When / Then
        await expect(loadSourceHelper()).rejects.toThrow('No SOURCE_HASH_SECRET_PARAMETER');
        expect(ssm.calls()).toHaveLength(0);
    });

    test('should fail to load when its parameter has no value', async () => {
        // Given
        vi.stubEnv('SOURCE_HASH_SECRET', undefined);
        vi.stubEnv('SOURCE_HASH_SECRET_PARAMETER', PARAMETER);
        ssm.on(GetParameterCommand).resolves({ Parameter: { Name: PARAMETER } });

        // When / Then
        await expect(loadSourceHelper()).rejects.toThrow(`No value in the SSM parameter ${ PARAMETER }`);
    });

    test('should fail to load when SSM does not read its parameter', async () => {
        // Given
        vi.stubEnv('SOURCE_HASH_SECRET', undefined);
        vi.stubEnv('SOURCE_HASH_SECRET_PARAMETER', PARAMETER);
        ssm.on(GetParameterCommand).rejects(new ParameterNotFound({ $metadata: {}, message: 'Parameter not found' }));

        // When / Then
        await expect(loadSourceHelper()).rejects.toThrow('Parameter not found');
    });
});
