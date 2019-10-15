import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import SignalRequest from 'src/interfaces/signal-request';
import SignalResponse from 'src/interfaces/signal-response';
import RoomDocument from 'src/entities/room-document';
import PlayerDocument from 'src/entities/player-document';


export default class SignalHandler extends MessageHandler {

    protected data: SignalRequest | undefined;

    public constructor(ddb: AWS.DynamoDB,
        tableName: string,
        apigwManagementApi: AWS.ApiGatewayManagementApi,
        event: APIGatewayProxyEvent,
        payload: RequestPayload) {
        super(ddb, tableName, apigwManagementApi, event, payload);
    }

    protected parsePayload(): SignalRequest {
        if (this.payload.type !== RequestPayloadType.SIGNAL || !this.payload.data) {
            throw new Error(SignalHandler.ERROR_PARSING);
        }

        try {
            const data: SignalRequest = JSON.parse(this.payload.data);
            if (!data.roomName || !data.to || !data.signal) {
                throw new Error(SignalHandler.ERROR_PARSING);
            }
            return data;
        } catch (e) {
            throw new Error(SignalHandler.ERROR_PARSING);
        }
    }

    protected async handle(): Promise<void> {
        if (!this.data) {
            throw new Error(SignalHandler.ERROR_DATA_UNDEFINED);
        }

        const room: RoomDocument = await this.getRoom(this.data.roomName);

        if (!room) {
            throw new Error('Room does not exist');
        }

        const fromPlayer: PlayerDocument | null = this.getPlayerByConnectionId(room, this.connectionId);
        const toPlayer: PlayerDocument | null = this.getPlayerByName(room, this.data.to);

        if (fromPlayer === null) {
            throw new Error('You was not in the queue!');
        }

        if (toPlayer === null) {
            throw new Error('No destination found!');
        }

        await this.sendTo(toPlayer.connectionId.S, this.signalResponse(this.data, fromPlayer));
    }

    private signalResponse(data: SignalRequest, fromPlayer: PlayerDocument): string {
        const response: SignalResponse = {
            from: fromPlayer.playerName.S,
            signal: data.signal
        };

        return this.response(ResponsePayloadType.SIGNAL, response);
    }
}
