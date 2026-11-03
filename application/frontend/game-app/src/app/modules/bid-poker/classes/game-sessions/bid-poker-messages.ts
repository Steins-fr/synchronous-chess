import { SeatMessage, UnseatMessage } from '@app/modules/game-table/classes/table-seats';
import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';

export enum BPGameSessionType {
    /** A participant takes a seat, or leaves its seat */
    SEAT = 'BP_seat',
    /** A player frees the seat of another one, away while the seats are open */
    UNSEAT = 'BP_unseat',
    /** A player starts the game, or commits to its random part of the draw of the deck, or reveals it */
    DRAW = 'BP_draw',
    /** A player commits to its bid on the lot, or to its discards */
    COMMIT = 'BP_commit',
    /** A player reveals its bid on the lot, once the bidding closed */
    REVEAL = 'BP_reveal',
    /** A player reveals its discards, once the discarding closed */
    DISCARD = 'BP_discard',
    /** A player tells the time of the phase is over: the players it waits for act with no bid or no discard */
    TIMEOUT = 'BP_timeout',
    /** A player starts a new game, once the former one is over */
    REMATCH = 'BP_rematch',
}

/** The game of a message: a message of another one is void */
export interface BidRound {
    /** The index of the game in the room */
    game: number;
    /** The draws of the game: a draw timing out starts again */
    attempt: number;
}

/** The start of the game, with the commitment of its player, a commitment of another player, or a random part revealed */
export interface BidDrawMessage extends BidRound {
    /** The players the start names, the seated ones in the order of their seats: a start naming others is void */
    players?: ReadonlyArray<string>;
    commitment?: string;
    part?: string;
}

export interface BidCommitMessage extends BidRound {
    /** 0 the dealing session, then the change sessions */
    session: number;
    /** The index of the lot in the session, null for the discards */
    lot: number | null;
    commitment: string;
}

export interface BidRevealMessage extends BidRound {
    session: number;
    lot: number;
    amount: number;
    salt: string;
}

export interface BidDiscardMessage extends BidRound {
    session: number;
    /** The indexes of the cards in the deck, in the order of the discards */
    cards: ReadonlyArray<number>;
    salt: string;
}

export interface BidTimeoutMessage extends BidRound {
    /** The step the claim waited at: a move applied meanwhile voids it */
    step: number;
}

export interface BidRematchMessage {
    /** The index of the new game in the room */
    game: number;
}

export interface BidPokerPayloads {
    [BPGameSessionType.SEAT]: SeatMessage;
    [BPGameSessionType.UNSEAT]: UnseatMessage;
    [BPGameSessionType.DRAW]: BidDrawMessage;
    [BPGameSessionType.COMMIT]: BidCommitMessage;
    [BPGameSessionType.REVEAL]: BidRevealMessage;
    [BPGameSessionType.DISCARD]: BidDiscardMessage;
    [BPGameSessionType.TIMEOUT]: BidTimeoutMessage;
    [BPGameSessionType.REMATCH]: BidRematchMessage;
}

export type BidPokerMessage = {
    [Type in keyof BidPokerPayloads]: AppMessage<Type, BidPokerPayloads[Type]>;
}[keyof BidPokerPayloads];

export const bidPokerBlockChains: BlockChainRouting<BidPokerPayloads> = {
    [BPGameSessionType.SEAT]: BlockChainName.BID_POKER,
    [BPGameSessionType.UNSEAT]: BlockChainName.BID_POKER,
    [BPGameSessionType.DRAW]: BlockChainName.BID_POKER,
    [BPGameSessionType.COMMIT]: BlockChainName.BID_POKER,
    [BPGameSessionType.REVEAL]: BlockChainName.BID_POKER,
    [BPGameSessionType.DISCARD]: BlockChainName.BID_POKER,
    [BPGameSessionType.TIMEOUT]: BlockChainName.BID_POKER,
    [BPGameSessionType.REMATCH]: BlockChainName.BID_POKER,
};
