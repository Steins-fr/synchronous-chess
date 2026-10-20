import { environmentAccessKey, isAccessGranted } from '@helpers/access-cookie.helper';
import { parseCookies } from '@helpers/cookie.helper';
import { headerValue } from '@helpers/header.helper';
import { epochSeconds } from '@helpers/time.helper';
import { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';

/**
 * The authorizer of `$connect` on a stage restricted to its owner: a websocket opens with the access cookies of the front,
 * sent by the browser with the handshake (same site). API Gateway refuses a handshake without Cookie header (401) before
 * running it, and with a Deny (403)
 */
export const handler = function (event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
    const granted: boolean = isAccessGranted(parseCookies(headerValue(event.headers, 'Cookie')), environmentAccessKey(), epochSeconds());

    return Promise.resolve({
        principalId: 'owner',
        policyDocument: {
            Version: '2012-10-17',
            Statement: [{ Action: 'execute-api:Invoke', Effect: granted ? 'Allow' : 'Deny', Resource: event.methodArn }],
        },
    });
};
