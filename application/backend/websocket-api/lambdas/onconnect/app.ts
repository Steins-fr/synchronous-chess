import { APIGatewayProxyEvent } from 'aws-lambda';

interface Response {
    statusCode: number;
    body: string;
}

// Not async, nothing to await: a promise still, the Node.js runtime of Lambda waits for a callback otherwise
export const handler = function (
    event: APIGatewayProxyEvent
): Promise<Response> {
    console.log(`New connection: ${event.requestContext.connectionId}`);

    return Promise.resolve({ statusCode: 200, body: 'Connected' });
};
