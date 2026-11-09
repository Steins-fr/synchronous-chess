import { CommitRevealTypes, DrawMessage, GameRound, RematchMessage, TimeoutMessage } from '@app/modules/commit-reveal/classes/commit-reveal-messages';
import { SeatMessage, UnseatMessage } from '@app/modules/game-table/classes/table-seats';
import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Apple } from '../rules/eden-rules';

export enum GEGameSessionType {
    /** A participant takes a seat, or leaves its seat */
    SEAT = 'GE_seat',
    /** A player frees the seat of another one, away while the seats are open */
    UNSEAT = 'GE_unseat',
    /** A player starts the game with its setup, or commits to its random part of the draw of the game, or reveals it */
    DRAW = 'GE_draw',
    /** A player commits to its apple */
    COMMIT = 'GE_commit',
    /** A player reveals its apple, once every player still in committed */
    REVEAL = 'GE_reveal',
    /** A player tells the time of the phase is over: the players it waits for missed it */
    TIMEOUT = 'GE_timeout',
    /** A player starts a new game, once the former one is over */
    REMATCH = 'GE_rematch',
}

/** The round of a message: a message of another one is void */
export interface RoundKey {
    round: number;
}

/**
 * The start of the game, with the setup of its player, a commitment of a player to its random part, or a random part
 * revealed
 */
export interface EdenDrawMessage extends DrawMessage {
    /** The seconds of a vote */
    voteTime?: number;
    /** The millions each player starts with */
    startMoney?: number;
}

export interface EdenCommitMessage extends GameRound, RoundKey {
    commitment: string;
}

export interface EdenRevealMessage extends GameRound, RoundKey {
    apple: Apple;
    salt: string;
}

/** The types of the messages the Garden of Eden shares with the other games committing then revealing their moves */
export const EDEN_TYPES = {
    seat: GEGameSessionType.SEAT,
    unseat: GEGameSessionType.UNSEAT,
    draw: GEGameSessionType.DRAW,
    timeout: GEGameSessionType.TIMEOUT,
    rematch: GEGameSessionType.REMATCH,
} as const satisfies CommitRevealTypes;

export interface EdenPayloads {
    [GEGameSessionType.SEAT]: SeatMessage;
    [GEGameSessionType.UNSEAT]: UnseatMessage;
    [GEGameSessionType.DRAW]: EdenDrawMessage;
    [GEGameSessionType.COMMIT]: EdenCommitMessage;
    [GEGameSessionType.REVEAL]: EdenRevealMessage;
    [GEGameSessionType.TIMEOUT]: TimeoutMessage;
    [GEGameSessionType.REMATCH]: RematchMessage;
}

export type EdenMessage = {
    [Type in keyof EdenPayloads]: AppMessage<Type, EdenPayloads[Type]>;
}[keyof EdenPayloads];

export const edenBlockChains: BlockChainRouting<EdenPayloads> = {
    [GEGameSessionType.SEAT]: BlockChainName.EDEN,
    [GEGameSessionType.UNSEAT]: BlockChainName.EDEN,
    [GEGameSessionType.DRAW]: BlockChainName.EDEN,
    [GEGameSessionType.COMMIT]: BlockChainName.EDEN,
    [GEGameSessionType.REVEAL]: BlockChainName.EDEN,
    [GEGameSessionType.TIMEOUT]: BlockChainName.EDEN,
    [GEGameSessionType.REMATCH]: BlockChainName.EDEN,
};
