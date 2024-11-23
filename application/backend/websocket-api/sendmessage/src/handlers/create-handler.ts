import { BadRequestException } from '../../../../layers/room-manager/src/index';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '../types/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class CreateHandler extends MessageHandler {

    private static readonly ERROR_ROOM_ALREADY_EXIST: string = 'Room already exists';

    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.CREATE);

        if (!data.roomName || !data.maxPlayer || !data.playerName) {
            throw new BadRequestException(CreateHandler.ERROR_PARSING);
        }

        if (await this.roomService.roomExist(data.roomName)) {
            throw new BadRequestException(CreateHandler.ERROR_ROOM_ALREADY_EXIST);
        }

        await this.connectionService.create({ connectionId: this.connectionId, roomName: data.roomName });
        await this.roomService.create(data.roomName, this.connectionId, data.playerName, data.maxPlayer);

        await this.reply(RoomApiResponseTypeEnum.CREATED, data);
    }
}
