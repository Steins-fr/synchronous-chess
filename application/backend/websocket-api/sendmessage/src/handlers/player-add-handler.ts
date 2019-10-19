import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import PlayerRequest from 'src/interfaces/player-request';
import PlayerResponse from 'src/interfaces/player-response';
import { Room } from '/opt/nodejs/room-database';


export default class PlayerAddHandler extends MessageHandler {

    protected data: PlayerRequest | undefined;

    public constructor(
        apigwManagementApi: AWS.ApiGatewayManagementApi,
        event: APIGatewayProxyEvent,
        payload: RequestPayload) {
        super(apigwManagementApi, event, payload);
    }

    protected parsePayload(): PlayerRequest {
        if (this.payload.type !== RequestPayloadType.PLAYER_ADD || !this.payload.data) {
            throw new Error(PlayerAddHandler.ERROR_PARSING);
        }

        try {
            const data: PlayerRequest = JSON.parse(this.payload.data);
            if (!data.playerName || !data.roomName) {
                throw new Error(PlayerAddHandler.ERROR_PARSING);
            }
            return data;
        } catch (e) {
            throw new Error(PlayerAddHandler.ERROR_PARSING);
        }
    }

    protected async handle(): Promise<void> {
        if (!this.data) {
            throw new Error(PlayerAddHandler.ERROR_DATA_UNDEFINED);
        }

        const room: Room = await this.roomService.getRoomByKeys(this.connectionId, this.data.roomName);

        if (!room) {
            throw new Error(PlayerAddHandler.ERROR_ROOM_DOES_NOT_EXIST);
        }

        await this.roomService.addPlayerToRoom(this.data.playerName, room);

        await this.sendTo(this.connectionId, this.playerAddResponse(this.data));
    }

    private playerAddResponse(data: PlayerRequest): string {
        const response: PlayerResponse = data;

        return this.response(ResponsePayloadType.ADDED, response);
    }
}
