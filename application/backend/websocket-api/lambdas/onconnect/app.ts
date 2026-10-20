import { isAllowedOrigin } from '@helpers/origin.helper';
import { APIGatewayProxyEvent } from 'aws-lambda';

interface Response {
    statusCode: number;
    body: string;
}

/**
 * Opens the connections of the pages of the game app only. API Gateway refuses the handshake of another client, which
 * then never opens: no $disconnect follows, whose statement would wake the paused database
 */
// Not async, nothing to await: a promise still, the Node.js runtime of Lambda waits for a callback otherwise
export const handler = function (
    event: APIGatewayProxyEvent
): Promise<Response> {
    if (!isAllowedOrigin(event.headers)) {
        console.warn(`Connection refused, not from the game app: ${event.requestContext.connectionId}`);
        return Promise.resolve({ statusCode: 403, body: 'Forbidden' });
    }

    console.log(`New connection: ${event.requestContext.connectionId}`);

    return Promise.resolve({ statusCode: 200, body: 'Connected' });
};
