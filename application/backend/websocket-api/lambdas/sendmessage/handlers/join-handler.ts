import BadRequestException from '@exceptions/bad-request-exception';
import { isName } from '@helpers/text.helper';
import { isToken } from '@helpers/token.helper';
import { PLAYER_NAME_MAX_LENGTH, ROOM_ID_MAX_LENGTH } from '@protocol/room-limits';
import { isRoomGame } from '@protocol/room-game.enum';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import {
    RoomApiRequestTypeEnum,
    RoomApiResponseTypeEnum,
    RoomSocketApiNotificationEnum
} from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';
import Room from '@models/room';
import RoomHelper from '@helpers/room-helper';
import RoomPasswordService from '@services/room-password-service';

export default class JoinHandler extends MessageHandler {
    private readonly roomPasswordService: RoomPasswordService = new RoomPasswordService();

    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.JOIN);

        if (!isName(data.roomName, ROOM_ID_MAX_LENGTH) || !isName(data.playerName, PLAYER_NAME_MAX_LENGTH) || !isToken(data.token) || !isToken(data.browserId)
            || !isRoomGame(data.game)) {
            throw new BadRequestException(JoinHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);
        this.roomService.gameGuard(room, data.game);
        // Before the password, a join refused anyway not counted as an attempt: the list of the rooms tells it already
        this.roomService.hostConnectedGuard(room);
        // Before the names of the room: they are told to the players giving its password only
        await this.roomPasswordService.passwordGuard(room, data, this.sourceIp);

        if (RoomHelper.isInGame(room, data.playerName)) {
            throw new BadRequestException(RoomApiErrorMessage.ALREADY_IN_GAME);
        }

        if (RoomHelper.isInQueue(room, data.playerName)) {
            throw new BadRequestException(RoomApiErrorMessage.ALREADY_IN_QUEUE);
        }

        await this.createConnection(room.id);
        await this.roomService.addPlayerToQueue(data.playerName, this.connectionId, data.token, data.browserId, room);

        await this.notify(RoomSocketApiNotificationEnum.JOIN_REQUEST, room.connectionId, {
            playerName: data.playerName,
        });
        await this.reply(RoomApiResponseTypeEnum.JOINING_ROOM, {
            playerName: room.hostPlayer,
        });
    }
}
