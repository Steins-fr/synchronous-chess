import BadRequestException from '@exceptions/bad-request-exception';
import { isName } from '@helpers/text.helper';
import Room from '@models/room';
import { PLAYER_NAME_MAX_LENGTH, ROOM_ID_MAX_LENGTH } from '@protocol/room-limits';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class PlayerAddHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.PLAYER_ADD);

        if (!isName(data.playerName, PLAYER_NAME_MAX_LENGTH) || !isName(data.roomName, ROOM_ID_MAX_LENGTH)) {
            throw new BadRequestException(PlayerAddHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);

        this.roomService.canEditRoomGuard(room, this.connectionId);

        await this.roomService.addPlayerToRoom(data.playerName, room);

        await this.reply(RoomApiResponseTypeEnum.ADDED, data);
    }
}
