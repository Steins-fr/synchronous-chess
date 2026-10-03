import { BlockChainName } from '../block-chain-name.enum';

export enum CheatReason {
    /** The entry is not signed by its author, the sequencer checks it before ordering */
    FORGED_AUTHOR = 'forgedAuthor',
    /** The entry was already in the chain */
    REPLAYED_ENTRY = 'replayedEntry',
    /** The message type is carried by another chain */
    WRONG_CHAIN = 'wrongChain',
    /** The block is not signed by its sequencer */
    FORGED_SEQUENCING = 'forgedSequencing',
    /** The sequencer signed another block for an index already in the chain */
    CONFLICTING_BLOCK = 'conflictingBlock',
    /** The hash of the block does not match its content */
    INVALID_BLOCK = 'invalidBlock',
    /** The sequencer orders other entries, but not this one */
    CENSORED_ENTRY = 'censoredEntry',
    /** Detected by the application: a move against the rules of the game */
    ILLEGAL_MOVE = 'illegalMove',
    /** Detected by the application: a revealed move not matching the commitment of its player */
    INVALID_REVEAL = 'invalidReveal',
}

/** The cheats only the sequencer can commit: enough participants reporting them hand the ordering over */
export const sequencerCheats: ReadonlySet<CheatReason> = new Set([
    CheatReason.FORGED_AUTHOR,
    CheatReason.REPLAYED_ENTRY,
    CheatReason.WRONG_CHAIN,
    CheatReason.FORGED_SEQUENCING,
    CheatReason.CONFLICTING_BLOCK,
    CheatReason.INVALID_BLOCK,
    CheatReason.CENSORED_ENTRY,
]);

/** A cheat a participant detected */
export interface CheatReport {
    chain: BlockChainName;
    /** The hash of the block, or the id of the entry the sequencer does not order */
    subject: string;
    /** The index of the block, none for an entry not ordered */
    index?: number;
    /** The participant the entry claims to come from */
    author: string;
    sequencer: string;
    reason: CheatReason;
}

export interface CheatReporting {
    reporter: string;
    reason: CheatReason;
}

/** A block or an entry reported as cheated, with all the participants who reported it */
export interface CheatFlag extends Omit<CheatReport, 'reason'> {
    reports: ReadonlyArray<Readonly<CheatReporting>>;
}
