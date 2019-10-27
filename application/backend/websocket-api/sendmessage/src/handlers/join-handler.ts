import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import JoinRequest from 'src/interfaces/join-request';
import JoinResponse from 'src/interfaces/join-response';
import { Room, RoomHelper, BadRequestException } from '/opt/nodejs/room-manager';
import ResponsePayload from 'src/interfaces/response-payload';


export default class JoinHandler extends MessageHandler {

    private static readonly ERROR_ALREADY_IN_GAME: string = 'Already in game';
    private static readonly ERROR_ALREADY_IN_QUEUE: string = 'Already in queue';

    protected data: JoinRequest | undefined;

    public constructor(
        apigwManagementApi: AWS.ApiGatewayManagementApi,
        event: APIGatewayProxyEvent,
        payload: RequestPayload) {
        super(apigwManagementApi, event, payload);
    }

    protected parsePayload(): JoinRequest {
        if (this.payload.type !== RequestPayloadType.JOIN || !this.payload.data) {
            throw new BadRequestException(JoinHandler.ERROR_PARSING);
        }

        try {
            const data: JoinRequest = JSON.parse(this.payload.data);
            if (!data.roomName || !data.playerName) {
                throw new BadRequestException(JoinHandler.ERROR_PARSING);
            }
            return data;
        } catch (e) {
            throw new BadRequestException(JoinHandler.ERROR_PARSING);
        }
    }

    protected async handle(): Promise<void> {
        if (!this.data) {
            throw new BadRequestException(JoinHandler.ERROR_DATA_UNDEFINED);
        }

        const room: Room = await this.roomService.getRoomByName(this.data.roomName);

        if (RoomHelper.isInGame(room, this.data.playerName)) {
            throw new BadRequestException(JoinHandler.ERROR_ALREADY_IN_GAME);
        }

        if (RoomHelper.isInQueue(room, this.data.playerName)) {
            throw new BadRequestException(JoinHandler.ERROR_ALREADY_IN_QUEUE);
        }

        await this.connectionService.create({ connectionId: this.connectionId, roomName: room.ID });
        await this.roomService.addPlayerToQueue(this.data.playerName, this.connectionId, room);

        await this.sendTo(room.connectionId, this.joinReplyResponse(this.data));
        await this.reply(this.joinResponse(room));
    }

    private joinReplyResponse(data: JoinRequest): ResponsePayload {
        const response: JoinResponse = {
            playerName: data.playerName,
        };

        return this.response(ResponsePayloadType.JOIN, response);
    }

    private joinResponse(room: Room): ResponsePayload {
        const response: JoinResponse = {
            playerName: room.hostPlayer,
        };

        return this.response(ResponsePayloadType.JOINING, response);
    }
}
