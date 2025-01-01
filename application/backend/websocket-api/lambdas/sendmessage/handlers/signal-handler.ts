import BadRequestException from '@exceptions/bad-request-exception';
import RoomHelper from '@helpers/room-helper';
import Player from '@models/player';
import Room from '@models/room';
import {
    RoomApiRequestTypeEnum,
    RoomSocketApiNotificationEnum,
    RoomApiResponseTypeEnum
} from '../types/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class SignalHandler extends MessageHandler {
    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.SIGNAL);

        if (!data.roomName || !data.to || !data.signal) {
            throw new BadRequestException(SignalHandler.ERROR_PARSING);
        }

        const room: Room = await this.roomService.getRoomByName(data.roomName);

        let toConnectionId: string;
        let fromPlayerName: string = room.hostPlayer;

        if (this.connectionId !== room.connectionId) { // Send the message to the host
            toConnectionId = room.connectionId;
            const fromPlayer: Player | null = RoomHelper.getPlayerByConnectionId(room, this.connectionId);

            if (fromPlayer === null) {
                throw new BadRequestException('You were not in the queue!');
            }

            fromPlayerName = fromPlayer.playerName;
        } else {
            const toPlayer: Player | null = RoomHelper.getPlayerByName(room, data.to);

            if (!toPlayer?.connectionId) {
                throw new BadRequestException('The player was not in the queue!');
            }

            toConnectionId = toPlayer.connectionId;
        }

        await this.notify(RoomSocketApiNotificationEnum.REMOTE_SIGNAL, toConnectionId, {
            from: fromPlayerName,
            signal: data.signal
        });
        await this.reply(RoomApiResponseTypeEnum.SIGNAL_SENT, {
            from: fromPlayerName,
            signal: data.signal
        });
    }
}
