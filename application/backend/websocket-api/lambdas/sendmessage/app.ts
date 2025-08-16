import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { APIGatewayProxyEvent } from 'aws-lambda';
import CreateHandler from './handlers/create-handler';
import FullHandler from './handlers/full-handler';
import JoinHandler from './handlers/join-handler';
import MessageHandler from './handlers/message-handler';
import PlayerAddHandler from './handlers/player-add-handler';
import PlayerGetAllHandler from './handlers/player-get-all-handler';
import PlayerRemoveHandler from './handlers/player-remove-handler';
import SignalHandler from './handlers/signal-handler';
import { SocketPacketRequestPayload } from './types/socket-packet-payload.type';

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
}

const messageHandlers: MessageHandlers = {
    create: CreateHandler,
    join: JoinHandler,
    full: FullHandler,
    signal: SignalHandler,
    playerGetAll: PlayerGetAllHandler,
    playerAdd: PlayerAddHandler,
    playerRemove: PlayerRemoveHandler
};

export const handler = async function (event: APIGatewayProxyEvent): Promise<Response> {
    const client = new ApiGatewayManagementApiClient({
        endpoint: `https://${event.requestContext.domainName}`,
    });

    try {
        const body: string = event.body as string;
        const connectionId = event.requestContext.connectionId;

        if (!connectionId) {
            return { statusCode: 401, body: 'Unauthorized request.' };
        }

        const payload: SocketPacketRequestPayload = JSON.parse(body).data;

        if (messageHandlers[payload.type]) {
            const messageHandler: MessageHandler = new messageHandlers[payload.type](client, connectionId, payload);
            await messageHandler.execute();
        } else {
            return { statusCode: 401, body: 'Operation not permitted.' };
        }
    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: 'Server error.' };
    }

    return { statusCode: 200, body: 'Data sent.' };
};
