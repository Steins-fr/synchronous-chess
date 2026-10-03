import BadRequestException from '@exceptions/bad-request-exception';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class CreateHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.CREATE);

        if (!data.roomName || !data.maxPlayer || !data.playerName) {
            throw new BadRequestException(CreateHandler.ERROR_PARSING);
        }

        if (await this.roomService.roomExist(data.roomName)) {
            throw new BadRequestException(RoomApiErrorMessage.ROOM_ALREADY_EXISTS);
        }

        await this.connectionService.create({ connectionId: this.connectionId, roomName: data.roomName });
        await this.roomService.create(data.roomName, this.connectionId, data.playerName, data.maxPlayer);

        await this.reply(RoomApiResponseTypeEnum.CREATED, data);
    }
}
