import { epochSeconds } from '@helpers/time.helper';
import { accessCookies, stubAccessEnvironment } from '@testing/access';
import { aWebSocketAuthorizerEvent, CONNECT_METHOD_ARN } from '@testing/api-mocks';
import { APIGatewayAuthorizerResult } from 'aws-lambda';
import { beforeEach, describe, expect, test } from 'vitest';
import { handler } from './app';

/** The answer of the authorizer to the handshake: whether it lets it reach `$connect` */
function policyOf(effect: 'Allow' | 'Deny'): APIGatewayAuthorizerResult {
    return {
        principalId: 'owner',
        policyDocument: { Version: '2012-10-17', Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: CONNECT_METHOD_ARN }] },
    };
}

describe('wsauthorizer lambda', () => {
    beforeEach(() => {
        stubAccessEnvironment();
    });

    test.each(['Cookie', 'cookie'])('should allow the handshake sending the access cookies in its %s header', async (header: string) => {
        // Given
        const event = aWebSocketAuthorizerEvent({ Host: 'sc-ws-test.steins.fr', [header]: `theme=dark; ${ accessCookies().join('; ') }` });

        // When / Then
        expect(await handler(event)).toEqual(policyOf('Allow'));
    });

    test('should deny the handshake sending expired access cookies', async () => {
        expect(await handler(aWebSocketAuthorizerEvent({ Cookie: accessCookies(epochSeconds() - 1).join('; ') }))).toEqual(policyOf('Deny'));
    });

    test.each([
        ['no header', null],
        ['no Cookie header', { Host: 'sc-ws-test.steins.fr' }],
        ['other cookies', { Cookie: 'theme=dark' }],
    ])('should deny the handshake sending %s', async (_case: string, headers: Record<string, string> | null) => {
        expect(await handler(aWebSocketAuthorizerEvent(headers))).toEqual(policyOf('Deny'));
    });
});
