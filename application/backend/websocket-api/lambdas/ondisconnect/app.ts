import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { getManagementApiEndpoint } from '@helpers/environment.helper';
import DisconnectionService from '@services/disconnection-service';

interface Response {
    statusCode: number;
    body: string;
}

export const handler = async function (event: APIGatewayProxyEvent): Promise<Response> {

    const connectionId: string | undefined = event.requestContext.connectionId;

    if (connectionId === undefined) {
        return { statusCode: 500, body: 'Undefined connection' };
    }

    const disconnection: DisconnectionService = new DisconnectionService(
        (): ApiGatewayManagementApiClient => new ApiGatewayManagementApiClient({ endpoint: getManagementApiEndpoint(event.requestContext.domainName) }),
    );

    try {
        if (!await disconnection.disconnect(connectionId)) {
            return { statusCode: 500, body: 'Undefined connection' };
        }
    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: 'Internal server error' };
    }

    return { statusCode: 200, body: 'Closed' };
};
