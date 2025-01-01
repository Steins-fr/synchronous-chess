import BadRequestException from '@exceptions/bad-request-exception';
import Room from '@models/room';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '../types/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class PlayerAddHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.PLAYER_ADD);

        if (!data.playerName || !data.roomName) {
            throw new BadRequestException(PlayerAddHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);

        this.roomService.canEditRoomGuard(room, this.connectionId);

        await this.roomService.addPlayerToRoom(data.playerName, room);

        await this.reply(RoomApiResponseTypeEnum.ADDED, data);
    }
}
