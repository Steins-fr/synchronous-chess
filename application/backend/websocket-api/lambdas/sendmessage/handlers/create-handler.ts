import BadRequestException from '@exceptions/bad-request-exception';
import { isToken } from '@helpers/token.helper';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class CreateHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.CREATE);

        if (!data.roomName || !data.maxPlayer || !data.playerName || !isToken(data.token)) {
            throw new BadRequestException(CreateHandler.ERROR_PARSING);
        }

        await this.roomService.notHostingGuard(await this.connectionService.get(this.connectionId));
        // Before the room: a connection whose room was not created leaves no room on $disconnect, a room without its
        // host connection would never wait for it
        await this.connectionService.create({ connectionId: this.connectionId, roomName: data.roomName });
        await this.roomService.create(data.roomName, this.connectionId, data.playerName, data.maxPlayer, data.token);

        await this.reply(RoomApiResponseTypeEnum.CREATED, {
            roomName: data.roomName,
            playerName: data.playerName,
            maxPlayer: data.maxPlayer,
        });
    }
}
