import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { APIGatewayProxyEvent } from 'aws-lambda';
import BanHandler from './handlers/ban-handler';
import CreateHandler from './handlers/create-handler';
import FullHandler from './handlers/full-handler';
import JoinHandler from './handlers/join-handler';
import MessageHandler from './handlers/message-handler';
import PlayerAddHandler from './handlers/player-add-handler';
import PlayerGetAllHandler from './handlers/player-get-all-handler';
import PlayerRemoveHandler from './handlers/player-remove-handler';
import ReconnectHandler from './handlers/reconnect-handler';
import SignalHandler from './handlers/signal-handler';
import { SocketPacketRequestPayload } from '@protocol/socket-packet-payload.type';
import { getManagementApiEndpoint } from '@helpers/environment.helper';

interface Response {
    statusCode: number;
    body: string;
}

interface MessageHandlers {
    create: typeof CreateHandler;
    join: typeof JoinHandler;
    full: typeof FullHandler;
    signal: typeof SignalHandler;
    playerGetAll: typeof PlayerGetAllHandler;
    playerAdd: typeof PlayerAddHandler;
    playerRemove: typeof PlayerRemoveHandler;
    reconnect: typeof ReconnectHandler;
    ban: typeof BanHandler;
}

const messageHandlers: MessageHandlers = {
    create: CreateHandler,
    join: JoinHandler,
    full: FullHandler,
    signal: SignalHandler,
    playerGetAll: PlayerGetAllHandler,
    playerAdd: PlayerAddHandler,
    playerRemove: PlayerRemoveHandler,
    reconnect: ReconnectHandler,
    ban: BanHandler,
};

export const handler = async function (event: APIGatewayProxyEvent): Promise<Response> {
    try {
        const body: string = event.body as string;
        const connectionId = event.requestContext.connectionId;

        if (!connectionId) {
            return { statusCode: 401, body: 'Unauthorized request.' };
        }

        const payload: SocketPacketRequestPayload = JSON.parse(body).data;

        // Its own keys only: an inherited one (constructor, toString, __proto__...) is not a request either
        if (!Object.hasOwn(messageHandlers, payload.type)) {
            return { statusCode: 401, body: 'Operation not permitted.' };
        }

        const client = new ApiGatewayManagementApiClient({
            endpoint: getManagementApiEndpoint(event.requestContext.domainName),
        });
        // Given by API Gateway: without it, a private room tells the clients apart by their connection
        const sourceIp: string = event.requestContext.identity?.sourceIp ?? connectionId;
        const messageHandler: MessageHandler = new messageHandlers[payload.type](client, connectionId, payload, sourceIp);
        await messageHandler.execute();
    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: 'Server error.' };
    }

    return { statusCode: 200, body: 'Data sent.' };
};
