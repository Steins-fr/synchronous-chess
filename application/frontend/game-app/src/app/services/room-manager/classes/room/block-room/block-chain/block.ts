import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';

/** A message of a participant, signed by it: the sequencer orders it but can not change it */
export interface ChainEntry {
    /** Unique, so that a replayed entry is detected */
    readonly id: string;
    readonly data: AppMessage;
    /** By the author of the data, over the chain name, the id and the data */
    readonly signature: string;
}

/** What a participant shows of its chain to the others, to compare them */
export type ChainHead = Pick<Block, 'index' | 'hash' | 'sequencer' | 'sequencerSignature'>;

export class Block {
    public constructor(
        public readonly index: number,
        public readonly previousHash: string,
        public readonly entry: ChainEntry,
        /** The participant who ordered the block, signing its hash */
        public readonly sequencer: string,
        public readonly hash: string,
        public readonly sequencerSignature: string,
    ) {}
}
