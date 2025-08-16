import { Room, RoomHelper, BadRequestException } from '/opt/nodejs/room-manager';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '../types/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class PlayerRemoveHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.PLAYER_REMOVE);

        if (!data.playerName || !data.roomName) {
            throw new BadRequestException(PlayerRemoveHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByKeys(this.connectionId, data.roomName);

        if (!RoomHelper.isInGame(room, data.playerName)) {
            throw new BadRequestException(PlayerRemoveHandler.ERROR_PLAYER_NOT_FOUND);
        }

        await this.roomService.removePlayerFromRoom(data.playerName, room);

        await this.reply(RoomApiResponseTypeEnum.REMOVED, data);
    }
}
