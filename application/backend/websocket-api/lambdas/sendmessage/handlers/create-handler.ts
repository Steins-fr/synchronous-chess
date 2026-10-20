import BadRequestException from '@exceptions/bad-request-exception';
import { isPassword } from '@helpers/password.helper';
import { isName } from '@helpers/text.helper';
import { isToken } from '@helpers/token.helper';
import { PLAYER_NAME_MAX_LENGTH, ROOM_MAX_PLAYERS, ROOM_NAME_MAX_LENGTH } from '@protocol/room-limits';
import { isRoomGame } from '@protocol/room-game.enum';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class CreateHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.CREATE);

        if (!isName(data.roomName, ROOM_NAME_MAX_LENGTH) || !CreateHandler.isMaxPlayer(data.maxPlayer) || !isName(data.playerName, PLAYER_NAME_MAX_LENGTH) || !isToken(data.token) || !isRoomGame(data.game)
            || (data.password !== undefined && !isPassword(data.password))) {
            throw new BadRequestException(CreateHandler.ERROR_PARSING);
        }

        await this.roomService.notHostingGuard(await this.connectionService.get(this.connectionId));
        // Before the room: a connection whose room was not created leaves no room on $disconnect, a room without its
        // host connection would never wait for it
        await this.createConnection(data.roomName);
        await this.roomService.create(data, this.connectionId);

        await this.reply(RoomApiResponseTypeEnum.CREATED, {
            roomName: data.roomName,
            playerName: data.playerName,
            maxPlayer: data.maxPlayer,
        });
    }

    /** Listed to every player of the game: a whole number of players, from the host alone to ROOM_MAX_PLAYERS */
    private static isMaxPlayer(value: unknown): value is number {
        return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= ROOM_MAX_PLAYERS;
    }
}
