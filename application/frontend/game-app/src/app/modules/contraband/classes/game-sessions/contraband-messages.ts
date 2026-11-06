import { CommitRevealTypes, DrawMessage, GameRound, RematchMessage, TimeoutMessage } from '@app/modules/commit-reveal/classes/commit-reveal-messages';
import { SeatMessage, UnseatMessage } from '@app/modules/game-table/classes/table-seats';
import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Call, ContrabandVariant } from '../rules/contraband-rules';

export enum CBGameSessionType {
    /** A participant takes a seat, or leaves its seat */
    SEAT = 'CB_seat',
    /** A player frees the seat of another one, away while the seats are open */
    UNSEAT = 'CB_unseat',
    /** A player starts the match with its setup, or commits to its random part of the draw of the match, or reveals it */
    DRAW = 'CB_draw',
    /** The smuggler commits to its trunk */
    COMMIT = 'CB_commit',
    /** The inspector calls */
    CALL = 'CB_call',
    /** The smuggler reveals its trunk, once called */
    REVEAL = 'CB_reveal',
    /** A player tells the time of the phase is over: the player it waits for missed it */
    TIMEOUT = 'CB_timeout',
    /** A player starts a new match, once the former one is over */
    REMATCH = 'CB_rematch',
}

/** The game of the match of a message: a message of another one is void */
export interface CrossingKey {
    /** The index of the game in the match */
    crossing: number;
}

/**
 * The start of the match, with the setup of its player, a commitment of a player to its random part, or a random part
 * revealed
 */
export interface ContrabandDrawMessage extends DrawMessage {
    /** The players of each country the start names, the North ones first: a start of other countries is void */
    north?: number;
    variant?: ContrabandVariant;
    /** The seconds of the customs */
    customsTime?: number;
    /** The games of the match */
    games?: number;
}

export interface ContrabandCommitMessage extends GameRound, CrossingKey {
    commitment: string;
}

export interface ContrabandCallMessage extends GameRound, CrossingKey {
    call: Call;
}

export interface ContrabandRevealMessage extends GameRound, CrossingKey {
    /** The money of the trunk, in millions: 0 for an iron bar */
    amount: number;
    salt: string;
}

/** The types of the messages the Contraband shares with the other games committing then revealing their moves */
export const CONTRABAND_TYPES = {
    seat: CBGameSessionType.SEAT,
    unseat: CBGameSessionType.UNSEAT,
    draw: CBGameSessionType.DRAW,
    timeout: CBGameSessionType.TIMEOUT,
    rematch: CBGameSessionType.REMATCH,
} as const satisfies CommitRevealTypes;

export interface ContrabandPayloads {
    [CBGameSessionType.SEAT]: SeatMessage;
    [CBGameSessionType.UNSEAT]: UnseatMessage;
    [CBGameSessionType.DRAW]: ContrabandDrawMessage;
    [CBGameSessionType.COMMIT]: ContrabandCommitMessage;
    [CBGameSessionType.CALL]: ContrabandCallMessage;
    [CBGameSessionType.REVEAL]: ContrabandRevealMessage;
    [CBGameSessionType.TIMEOUT]: TimeoutMessage;
    [CBGameSessionType.REMATCH]: RematchMessage;
}

export type ContrabandMessage = {
    [Type in keyof ContrabandPayloads]: AppMessage<Type, ContrabandPayloads[Type]>;
}[keyof ContrabandPayloads];

export const contrabandBlockChains: BlockChainRouting<ContrabandPayloads> = {
    [CBGameSessionType.SEAT]: BlockChainName.CONTRABAND,
    [CBGameSessionType.UNSEAT]: BlockChainName.CONTRABAND,
    [CBGameSessionType.DRAW]: BlockChainName.CONTRABAND,
    [CBGameSessionType.COMMIT]: BlockChainName.CONTRABAND,
    [CBGameSessionType.CALL]: BlockChainName.CONTRABAND,
    [CBGameSessionType.REVEAL]: BlockChainName.CONTRABAND,
    [CBGameSessionType.TIMEOUT]: BlockChainName.CONTRABAND,
    [CBGameSessionType.REMATCH]: BlockChainName.CONTRABAND,
};
