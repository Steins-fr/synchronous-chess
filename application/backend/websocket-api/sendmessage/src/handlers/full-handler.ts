import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import { Room, Player, RoomHelper, BadRequestException } from '/opt/nodejs/room-manager';
import ResponsePayload from 'src/interfaces/response-payload';
import FullRequest from 'src/interfaces/full-request';
import FullResponse from 'src/interfaces/full-response';


export default class FullHandler extends MessageHandler {

    protected data: FullRequest | undefined;

    public constructor(
        apigwManagementApi: AWS.ApiGatewayManagementApi,
        event: APIGatewayProxyEvent,
        payload: RequestPayload) {
        super(apigwManagementApi, event, payload);
    }

    protected parsePayload(): FullRequest {
        if (this.payload.type !== RequestPayloadType.FULL || !this.payload.data) {
            throw new BadRequestException(FullHandler.ERROR_PARSING);
        }

        try {
            const data: FullRequest = JSON.parse(this.payload.data);
            if (!data.roomName || !data.to) {
                throw new BadRequestException(FullHandler.ERROR_PARSING);
            }
            return data;
        } catch (e) {
            throw new BadRequestException(FullHandler.ERROR_PARSING);
        }
    }

    protected async handle(): Promise<void> {
        if (!this.data) {
            throw new BadRequestException(FullHandler.ERROR_DATA_UNDEFINED);
        }

        const room: Room = await this.roomService.getRoomByName(this.data.roomName);

        const toPlayer: Player | null = RoomHelper.getPlayerByName(room, this.data.to);
        if (toPlayer === null || toPlayer.connectionId === undefined) {
            throw new BadRequestException('The player was not in the queue!');
        }

        await this.sendTo(toPlayer.connectionId, this.fullResponse(room.ID, room.hostPlayer));
        await this.reply(this.fullReplyResponse(room.ID, room.hostPlayer));
    }

    private fullReplyResponse(roomName: string, playerName: string): ResponsePayload {
        const response: FullResponse = {
            from: playerName,
            roomName
        };

        return this.response(ResponsePayloadType.FULL_SENT, response);
    }

    private fullResponse(roomName: string, playerName: string): ResponsePayload {
        const response: FullResponse = {
            from: playerName,
            roomName
        };

        return this.response(ResponsePayloadType.FULL, response);
    }
}
