import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import { Room, BadRequestException, Player } from '/opt/nodejs/room-manager';
import ResponsePayload from 'src/interfaces/response-payload';
import PlayersResponse from 'src/interfaces/players-response';
import PlayersRequest from 'src/interfaces/players-request';


export default class PlayerGetAllHandler extends MessageHandler {

    protected data: PlayersRequest | undefined;

    public constructor(
        apigwManagementApi: AWS.ApiGatewayManagementApi,
        event: APIGatewayProxyEvent,
        payload: RequestPayload) {
        super(apigwManagementApi, event, payload);
    }

    protected parsePayload(): PlayersRequest {
        if (this.payload.type !== RequestPayloadType.PLAYER_GET_ALL || !this.payload.data) {
            throw new BadRequestException(PlayerGetAllHandler.ERROR_PARSING);
        }

        try {
            const data: PlayersRequest = JSON.parse(this.payload.data);
            if (!data.roomName) {
                throw new BadRequestException(PlayerGetAllHandler.ERROR_PARSING);
            }
            return data;
        } catch (e) {
            throw new BadRequestException(PlayerGetAllHandler.ERROR_PARSING);
        }
    }

    protected async handle(): Promise<void> {
        if (!this.data) {
            throw new BadRequestException(PlayerGetAllHandler.ERROR_DATA_UNDEFINED);
        }

        const room: Room = await this.roomService.getRoomByKeys(this.connectionId, this.data.roomName);

        await this.reply(this.playerGetAllResponse(room.players.map((player: Player) => player.playerName)));
    }

    private playerGetAllResponse(players: Array<string>): ResponsePayload {
        const response: PlayersResponse = { players };

        return this.response(ResponsePayloadType.PLAYERS, response);
    }
}
