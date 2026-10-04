import BadRequestException from '@exceptions/bad-request-exception';
import { isToken } from '@helpers/token.helper';
import Room from '@models/room';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

/** Moves a room to a new connection of its host: before API Gateway closes the former one, or once it did */
export default class ReconnectHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.RECONNECT);

        if (!data.roomName || !data.playerName || !isToken(data.token)) {
            throw new BadRequestException(ReconnectHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);

        // Before the room, like at its creation: the room must not move to a connection $disconnect would not find
        await this.connectionService.create({ connectionId: this.connectionId, roomName: room.id });
        await this.roomService.reconnectHost(room, this.connectionId, data.playerName, data.token);

        await this.reply(RoomApiResponseTypeEnum.RECONNECTED, { roomName: room.id });
    }
}
