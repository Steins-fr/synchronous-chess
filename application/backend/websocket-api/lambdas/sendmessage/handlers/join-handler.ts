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
        // After the password: a removal is told to the players of the room only. Before the names of the room: the player
        // removed is refused at once, while the host has not told the API it left yet (FORMER_CONNECTION, asked again)
        await this.roomService.notBannedGuard(room, data.playerName, data.browserId);
        this.nameGuard(room, data.playerName, data.token);

        await this.createConnection(room.id);
        await this.roomService.addPlayerToQueue(data.playerName, this.connectionId, data.token, data.browserId, room);

        await this.notify(RoomSocketApiNotificationEnum.JOIN_REQUEST, room.connectionId, {
            playerName: data.playerName,
        });
        await this.reply(RoomApiResponseTypeEnum.JOINING_ROOM, {
            playerName: room.hostPlayer,
        });
    }

    /**
     * The name is free, or held by the former connection of the player, its token the same: its page reloaded or lost
     * its connections, refused until the host tells it left (FORMER_CONNECTION, asked again). Another player holding
     * the name is refused at once: nothing reconnects
     */
    private nameGuard(room: Room, playerName: string, token: string): void {
        const inGame: boolean = RoomHelper.isInGame(room, playerName);

        if (!inGame && !RoomHelper.isInQueue(room, playerName)) {
            return;
        }

        if (RoomHelper.isTokenOf(room, playerName, token)) {
            throw new BadRequestException(RoomApiErrorMessage.FORMER_CONNECTION);
        }

        throw new BadRequestException(inGame ? RoomApiErrorMessage.ALREADY_IN_GAME : RoomApiErrorMessage.ALREADY_IN_QUEUE);
    }
}
