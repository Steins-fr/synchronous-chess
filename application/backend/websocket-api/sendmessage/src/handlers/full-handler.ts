import { Room, Player, RoomHelper, BadRequestException } from '../../../../layers/room-manager/src/index';
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

        const toPlayer: Player | null = RoomHelper.getPlayerByName(room, data.to);
        if (toPlayer === null || toPlayer.connectionId === undefined) {
            throw new BadRequestException('The player was not in the queue!');
        }

        await this.notify(RoomSocketApiNotificationEnum.FULL, toPlayer.connectionId, {
            from: room.hostPlayer,
            roomName: room.ID
        });
        await this.reply(RoomApiResponseTypeEnum.FULL_SENT, {
            from: room.hostPlayer,
            roomName: room.ID
        });
    }
}
