import BadRequestException from '@exceptions/bad-request-exception';
import { isToken } from '@helpers/token.helper';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import {
    RoomApiRequestTypeEnum,
    RoomApiResponseTypeEnum,
    RoomSocketApiNotificationEnum
} from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';
import Room from '@models/room';
import RoomHelper from '@helpers/room-helper';

export default class JoinHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.JOIN);

        if (!data.roomName || !data.playerName || !isToken(data.token)) {
            throw new BadRequestException(JoinHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);
        this.roomService.hostConnectedGuard(room);

        if (RoomHelper.isInGame(room, data.playerName)) {
            throw new BadRequestException(RoomApiErrorMessage.ALREADY_IN_GAME);
        }

        if (RoomHelper.isInQueue(room, data.playerName)) {
            throw new BadRequestException(RoomApiErrorMessage.ALREADY_IN_QUEUE);
        }

        await this.connectionService.create({ connectionId: this.connectionId, roomName: room.id });
        await this.roomService.addPlayerToQueue(data.playerName, this.connectionId, data.token, room);

        await this.notify(RoomSocketApiNotificationEnum.JOIN_REQUEST, room.connectionId, {
            playerName: data.playerName,
        });
        await this.reply(RoomApiResponseTypeEnum.JOINING_ROOM, {
            playerName: room.hostPlayer,
        });
    }
}
