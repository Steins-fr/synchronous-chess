import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import PlayerRequest from 'src/interfaces/player-request';
import PlayerResponse from 'src/interfaces/player-response';
import { Room, BadRequestException } from '/opt/nodejs/room-manager';
import ResponsePayload from 'src/interfaces/response-payload';


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
            throw new BadRequestException(PlayerAddHandler.ERROR_PARSING);
        }

        try {
            const data: PlayerRequest = JSON.parse(this.payload.data);
            if (!data.playerName || !data.roomName) {
                throw new BadRequestException(PlayerAddHandler.ERROR_PARSING);
            }
            return data;
        } catch (e) {
            throw new BadRequestException(PlayerAddHandler.ERROR_PARSING);
        }
    }

    protected async handle(): Promise<void> {
        if (!this.data) {
            throw new BadRequestException(PlayerAddHandler.ERROR_DATA_UNDEFINED);
        }

        const room: Room = await this.roomService.getRoomByKeys(this.connectionId, this.data.roomName);

        await this.roomService.addPlayerToRoom(this.data.playerName, room);

        await this.reply(this.playerAddResponse(this.data));
    }

    private playerAddResponse(data: PlayerRequest): ResponsePayload {
        const response: PlayerResponse = data;

        return this.response(ResponsePayloadType.ADDED, response);
    }
}
