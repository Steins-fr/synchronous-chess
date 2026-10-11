import BadRequestException from '@exceptions/bad-request-exception';
import { isRoomGame } from '@protocol/room-game.enum';
import { ROOM_SEARCH_MAX_LENGTH } from '@protocol/room-limits';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

/** Lists the rooms of a game, searched by name, to anyone: the connection needs no room */
export default class RoomGetAllHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.ROOM_GET_ALL);

        if (!isRoomGame(data.game) || !RoomGetAllHandler.isSearch(data.search)) {
            throw new BadRequestException(RoomGetAllHandler.ERROR_PARSING);
        }

        await this.reply(RoomApiResponseTypeEnum.ROOMS, await this.roomService.getOpenRooms(data.game, data.search));
    }

    /** No search, or a text of a reasonable length */
    private static isSearch(value: unknown): value is string | undefined {
        return value === undefined || (typeof value === 'string' && value.length <= ROOM_SEARCH_MAX_LENGTH);
    }
}
