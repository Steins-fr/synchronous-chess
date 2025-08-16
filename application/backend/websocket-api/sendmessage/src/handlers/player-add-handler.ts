import { Room, BadRequestException } from '/opt/nodejs/room-manager';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '../types/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class PlayerAddHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.PLAYER_ADD);

        if (!data.playerName || !data.roomName) {
            throw new BadRequestException(PlayerAddHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByKeys(this.connectionId, data.roomName);

        await this.roomService.addPlayerToRoom(data.playerName, room);

        await this.reply(RoomApiResponseTypeEnum.ADDED, data);
    }
}
