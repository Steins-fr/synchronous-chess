import BadRequestException from '@exceptions/bad-request-exception';
import { isName } from '@helpers/text.helper';
import Player from '@models/player';
import Room from '@models/room';
import { ROOM_ID_MAX_LENGTH } from '@protocol/room-limits';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class PlayerGetAllHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.PLAYER_GET_ALL);

        if (!isName(data.roomName, ROOM_ID_MAX_LENGTH)) {
            throw new BadRequestException(PlayerGetAllHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);

        await this.reply(RoomApiResponseTypeEnum.PLAYERS, {
            players: room.players.map((player: Player): string => player.playerName),
        });
    }
}
