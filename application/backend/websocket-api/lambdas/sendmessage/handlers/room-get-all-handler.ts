import BadRequestException from '@exceptions/bad-request-exception';
import { isRoomGame } from '@protocol/room-game.enum';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

/** Lists the rooms of a game a player can join, to anyone: the connection needs no room */
export default class RoomGetAllHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.ROOM_GET_ALL);

        if (!isRoomGame(data.game)) {
            throw new BadRequestException(RoomGetAllHandler.ERROR_PARSING);
        }

        await this.reply(RoomApiResponseTypeEnum.ROOMS, { rooms: await this.roomService.getOpenRooms(data.game) });
    }
}
