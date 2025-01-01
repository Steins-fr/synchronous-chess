import BadRequestException from '@exceptions/bad-request-exception';
import Player from '@models/player';
import Room from '@models/room';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '../types/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class PlayerGetAllHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.PLAYER_GET_ALL);

        if (!data.roomName) {
            throw new BadRequestException(PlayerGetAllHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);

        await this.reply(RoomApiResponseTypeEnum.PLAYERS, {
            players: room.players.map((player: Player): string => player.playerName),
        });
    }
}
