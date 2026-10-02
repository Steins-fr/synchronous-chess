import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';

export interface BlockRoomInterface {
    notifyMessage(data: AppMessage): void;
}
