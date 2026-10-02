import { BlockChainName } from '../block-chain-name.enum';

export enum CheatReason {
    /** The entry is not signed by its author */
    FORGED_AUTHOR = 'forgedAuthor',
    /** The entry was already in the chain */
    REPLAYED_ENTRY = 'replayedEntry',
    /** The message type is carried by another chain */
    WRONG_CHAIN = 'wrongChain',
    /** The block is not signed by its sequencer */
    FORGED_SEQUENCING = 'forgedSequencing',
    /** The sequencer sent another block for an index already in the chain */
    CONFLICTING_BLOCK = 'conflictingBlock',
    /** The hash of the block does not match its content */
    INVALID_BLOCK = 'invalidBlock',
}

/** A block a participant detected as cheated when adding it to its chain */
export interface CheatReport {
    chain: BlockChainName;
    index: number;
    hash: string;
    /** The participant the entry claims to come from */
    author: string;
    sequencer: string;
    reason: CheatReason;
}

export interface CheatReporting {
    reporter: string;
    reason: CheatReason;
}

/** A block reported as cheated, with all the participants who reported it */
export interface CheatFlag extends Omit<CheatReport, 'reason'> {
    reports: ReadonlyArray<Readonly<CheatReporting>>;
}
