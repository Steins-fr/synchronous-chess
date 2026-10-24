import BadRequestException from '@exceptions/bad-request-exception';
import { isName } from '@helpers/text.helper';
import RoomHelper from '@helpers/room-helper';
import Player from '@models/player';
import Room from '@models/room';
import { PLAYER_NAME_MAX_LENGTH, ROOM_ID_MAX_LENGTH } from '@protocol/room-limits';
import {
    RoomApiRequestTypeEnum,
    RoomSocketApiNotificationEnum,
    RoomApiResponseTypeEnum
} from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class FullHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.FULL);

        if (!isName(data.roomName, ROOM_ID_MAX_LENGTH) || !isName(data.to, PLAYER_NAME_MAX_LENGTH)) {
            throw new BadRequestException(FullHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);
        this.roomService.canEditRoomGuard(room, this.connectionId);

        const toPlayer: Player | null = RoomHelper.getPlayerByName(room, data.to);

        if (!toPlayer?.connectionId) {
            throw new BadRequestException('The player was not in the queue!');
        }

        await this.notify(RoomSocketApiNotificationEnum.FULL, toPlayer.connectionId, {
            from: room.hostPlayer,
            roomName: room.id
        });
        await this.reply(RoomApiResponseTypeEnum.FULL_SENT, {
            from: room.hostPlayer,
            roomName: room.id
        });
    }
}
