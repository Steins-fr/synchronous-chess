import BadRequestException from '@exceptions/bad-request-exception';
import RoomHelper from '@helpers/room-helper';
import Room from '@models/room';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '../types/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class PlayerRemoveHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.PLAYER_REMOVE);

        if (!data.playerName || !data.roomName) {
            throw new BadRequestException(PlayerRemoveHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);

        this.roomService.canEditRoomGuard(room, this.connectionId);

        if (!RoomHelper.isInGame(room, data.playerName)) {
            throw new BadRequestException(PlayerRemoveHandler.ERROR_PLAYER_NOT_FOUND);
        }

        await this.roomService.removePlayerFromRoom(data.playerName, room);

        await this.reply(RoomApiResponseTypeEnum.REMOVED, data);
    }
}
