import BadRequestException from '@exceptions/bad-request-exception';
import { isName } from '@helpers/text.helper';
import Room from '@models/room';
import { PLAYER_NAME_MAX_LENGTH, ROOM_ID_MAX_LENGTH } from '@protocol/room-limits';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

/**
 * The host tells the player the room removed: the API refuses its joins, by its name and by the browser it last joined
 * from, as long as the room lasts
 */
export default class BanHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.BAN);

        if (!isName(data.playerName, PLAYER_NAME_MAX_LENGTH) || !isName(data.roomName, ROOM_ID_MAX_LENGTH)) {
            throw new BadRequestException(BanHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);

        this.roomService.canEditRoomGuard(room, this.connectionId);

        if (data.playerName === room.hostPlayer) {
            throw new BadRequestException('The host can not be banned');
        }

        await this.roomService.banPlayer(data.playerName, room);

        await this.reply(RoomApiResponseTypeEnum.BANNED, { playerName: data.playerName });
    }
}
