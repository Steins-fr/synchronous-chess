import BadRequestException from '@exceptions/bad-request-exception';
import { isName } from '@helpers/text.helper';
import { isToken } from '@helpers/token.helper';
import Room from '@models/room';
import { PLAYER_NAME_MAX_LENGTH, ROOM_NAME_MAX_LENGTH } from '@protocol/room-limits';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

/**
 * Moves a room to a new connection of its host, before API Gateway closes the former one or once it did, or of a player
 * taking over from a host which left
 */
export default class ReconnectHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.RECONNECT);

        if (!isName(data.roomName, ROOM_NAME_MAX_LENGTH) || !isName(data.playerName, PLAYER_NAME_MAX_LENGTH) || !isToken(data.token)) {
            throw new BadRequestException(ReconnectHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);
        this.roomService.reconnectHostGuard(room, data.playerName);

        // Before the room, like at its creation: the room must not move to a connection $disconnect would not find
        await this.connectionService.create({ connectionId: this.connectionId, roomName: room.id });
        await this.roomService.reconnectHost(room, this.connectionId, data.playerName, data.token);

        await this.reply(RoomApiResponseTypeEnum.RECONNECTED, { roomName: room.id });
    }
}
