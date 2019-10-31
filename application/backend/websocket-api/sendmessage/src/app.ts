import * as AWS from 'aws-sdk';
import RequestPayload from './interfaces/request-payload';
import { APIGatewayProxyEvent } from 'aws-lambda';
import CreateHandler from './handlers/create-handler';
import MessageHandler from './handlers/message-handler';
import JoinHandler from './handlers/join-handler';
import FullHandler from './handlers/full-handler';
import SignalHandler from './handlers/signal-handler';
import PlayerAddHandler from './handlers/player-add-handler';
import PlayerRemoveHandler from './handlers/player-remove-handler';

interface Response {
    statusCode: number;
    body: string;
}

interface MessageHandlers {
    create: typeof CreateHandler;
    join: typeof JoinHandler;
    full: typeof FullHandler;
    signal: typeof SignalHandler;
    playerAdd: typeof PlayerAddHandler;
    playerRemove: typeof PlayerRemoveHandler;
}

const messageHandlers: MessageHandlers = {
    create: CreateHandler,
    join: JoinHandler,
    full: FullHandler,
    signal: SignalHandler,
    playerAdd: PlayerAddHandler,
    playerRemove: PlayerRemoveHandler
};

export const handler: (event: APIGatewayProxyEvent) => Promise<Response> = async function (event: APIGatewayProxyEvent): Promise<Response> {

    const apigwManagementApi: AWS.ApiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    try {
        const body: string = event.body as string;
        const payload: RequestPayload = JSON.parse(JSON.parse(body).data);

        if (messageHandlers[payload.type]) {
            const messageHandler: MessageHandler = new messageHandlers[payload.type](apigwManagementApi, event, payload);
            await messageHandler.execute();
        } else {
            return { statusCode: 401, body: 'Operation not permitted.' };
        }
    } catch (e) {
        return { statusCode: 500, body: 'Server error.' };
    }

    return { statusCode: 200, body: 'Data sent.' };
};
