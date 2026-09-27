import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';

export class Block {
    public constructor(
        public readonly index: number,
        public readonly timestamp: string,
        public readonly data: AppMessage,
        public readonly previousHash: string,
        public readonly hash: string,
        public readonly signature: string) {
    }
}
