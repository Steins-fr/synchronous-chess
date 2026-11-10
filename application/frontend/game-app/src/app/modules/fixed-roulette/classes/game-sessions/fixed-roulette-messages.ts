import { CommitRevealTypes, DrawMessage, GameRound, RematchMessage, TimeoutMessage } from '@app/modules/commit-reveal/classes/commit-reveal-messages';
import { SeatMessage, UnseatMessage } from '@app/modules/game-table/classes/table-seats';
import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Bets } from '../rules/fixed-roulette-rules';

export enum FRGameSessionType {
    /** A participant takes a seat, or leaves its seat */
    SEAT = 'FR_seat',
    /** A player frees the seat of another one, away while the seats are open */
    UNSEAT = 'FR_unseat',
    /** A player starts the match with its setup, or commits to its random part of the draw of the match, or reveals it */
    DRAW = 'FR_draw',
    /** The croupier commits to the pocket of the ball, and bets */
    COMMIT = 'FR_commit',
    /** The punter bets */
    BET = 'FR_bet',
    /** The croupier reveals the ball, once the punter bet */
    REVEAL = 'FR_reveal',
    /** A player tells the time of the phase is over: the player it waits for missed it */
    TIMEOUT = 'FR_timeout',
    /** A player starts a new match, once the former one is over */
    REMATCH = 'FR_rematch',
}

/** The game of the match of a message: a message of another one is void */
export interface RoundKey {
    /** The index of the game in the match */
    round: number;
}

/**
 * The start of the match, with the setup of its player, a commitment of a player to its random part, or a random part
 * revealed
 */
export interface FixedRouletteDrawMessage extends DrawMessage {
    /** The seconds of the croupier's and the punter's bets */
    betTime?: number;
}

/** The ball sealed and the bets of the croupier, public, in one message: the punter reads them, never the ball */
export interface FixedRouletteCommitMessage extends GameRound, RoundKey {
    commitment: string;
    bets: Bets;
}

export interface FixedRouletteBetMessage extends GameRound, RoundKey {
    bets: Bets;
}

export interface FixedRouletteRevealMessage extends GameRound, RoundKey {
    /** The pocket of the ball, numbered from 1 */
    pocket: number;
    salt: string;
}

/** The types of the messages the Fixed Roulette shares with the other games committing then revealing their moves */
export const FIXED_ROULETTE_TYPES = {
    seat: FRGameSessionType.SEAT,
    unseat: FRGameSessionType.UNSEAT,
    draw: FRGameSessionType.DRAW,
    timeout: FRGameSessionType.TIMEOUT,
    rematch: FRGameSessionType.REMATCH,
} as const satisfies CommitRevealTypes;

export interface FixedRoulettePayloads {
    [FRGameSessionType.SEAT]: SeatMessage;
    [FRGameSessionType.UNSEAT]: UnseatMessage;
    [FRGameSessionType.DRAW]: FixedRouletteDrawMessage;
    [FRGameSessionType.COMMIT]: FixedRouletteCommitMessage;
    [FRGameSessionType.BET]: FixedRouletteBetMessage;
    [FRGameSessionType.REVEAL]: FixedRouletteRevealMessage;
    [FRGameSessionType.TIMEOUT]: TimeoutMessage;
    [FRGameSessionType.REMATCH]: RematchMessage;
}

export type FixedRouletteMessage = {
    [Type in keyof FixedRoulettePayloads]: AppMessage<Type, FixedRoulettePayloads[Type]>;
}[keyof FixedRoulettePayloads];

export const fixedRouletteBlockChains: BlockChainRouting<FixedRoulettePayloads> = {
    [FRGameSessionType.SEAT]: BlockChainName.FIXED_ROULETTE,
    [FRGameSessionType.UNSEAT]: BlockChainName.FIXED_ROULETTE,
    [FRGameSessionType.DRAW]: BlockChainName.FIXED_ROULETTE,
    [FRGameSessionType.COMMIT]: BlockChainName.FIXED_ROULETTE,
    [FRGameSessionType.BET]: BlockChainName.FIXED_ROULETTE,
    [FRGameSessionType.REVEAL]: BlockChainName.FIXED_ROULETTE,
    [FRGameSessionType.TIMEOUT]: BlockChainName.FIXED_ROULETTE,
    [FRGameSessionType.REMATCH]: BlockChainName.FIXED_ROULETTE,
};
