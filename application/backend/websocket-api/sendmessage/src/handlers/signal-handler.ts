import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import SignalRequest from 'src/interfaces/signal-request';
import SignalResponse from 'src/interfaces/signal-response';
import { Room, Player, RoomService } from '/opt/nodejs/room-database';


export default class SignalHandler extends MessageHandler {

    protected data: SignalRequest | undefined;

    public constructor(
        apigwManagementApi: AWS.ApiGatewayManagementApi,
        event: APIGatewayProxyEvent,
        payload: RequestPayload) {
        super(apigwManagementApi, event, payload);
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

        const room: Room = await this.roomService.getRoomByName(this.data.roomName);

        if (!room) {
            throw new Error(SignalHandler.ERROR_ROOM_DOES_NOT_EXIST);
        }

        let toConnectionId: string;
        let fromPlayerName: string = room.hostPlayer;
        if (this.connectionId !== room.connectionId) { // Send the message to the host
            toConnectionId = room.connectionId;
            const fromPlayer: Player | null = RoomService.getPlayerByConnectionId(room, this.connectionId);
            if (fromPlayer === null) {
                throw new Error('You was not in the queue!');
            }
            fromPlayerName = fromPlayer.playerName;
        } else {
            const toPlayer: Player | null = RoomService.getPlayerByName(room, this.data.to);
            if (toPlayer === null || toPlayer.connectionId === undefined) {
                throw new Error('The player was not in the queue!');
            }
            toConnectionId = toPlayer.connectionId;
        }

        await this.sendTo(toConnectionId, this.signalResponse(this.data, fromPlayerName));
    }

    private signalResponse(data: SignalRequest, playerName: string): string {
        const response: SignalResponse = {
            from: playerName,
            signal: data.signal
        };

        return this.response(ResponsePayloadType.SIGNAL, response);
    }
}
