import BadRequestException from '@exceptions/bad-request-exception';
import RoomHelper from '@helpers/room-helper';
import Player from '@models/player';
import Room from '@models/room';
import {
    RoomApiRequestTypeEnum,
    RoomSocketApiNotificationEnum,
    RoomApiResponseTypeEnum
} from '../types/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class FullHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.FULL);

        if (!data.roomName || !data.to) {
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
