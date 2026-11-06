import { CommitRevealTypes, DrawMessage, GameRound, RematchMessage, TimeoutMessage } from '@app/modules/commit-reveal/classes/commit-reveal-messages';
import { SeatMessage, UnseatMessage } from '@app/modules/game-table/classes/table-seats';
import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { MinorityVariant, Vote } from '../rules/minority-rules';

export enum MGGameSessionType {
    /** A participant takes a seat, or leaves its seat */
    SEAT = 'MG_seat',
    /** A player frees the seat of another one, away while the seats are open */
    UNSEAT = 'MG_unseat',
    /** A player starts the game with its setup, or commits to its random part of the draw of the game, or reveals it */
    DRAW = 'MG_draw',
    /** The asker drawn asks its question */
    QUESTION = 'MG_question',
    /** A player commits to its vote */
    COMMIT = 'MG_commit',
    /** A player reveals its vote, once every player still in committed */
    REVEAL = 'MG_reveal',
    /** A player tells the time of the phase is over: the players it waits for missed it */
    TIMEOUT = 'MG_timeout',
    /** A player starts a new game, once the former one is over */
    REMATCH = 'MG_rematch',
}

/** The question of a message: a message of another one is void */
export interface QuestionKey {
    /** The index of the question in the game */
    round: number;
    /** The askers drawn for the question before: one late gives way to another */
    ask: number;
}

/**
 * The start of the game, with the setup of its player, a commitment of a player to its random part, or a random part
 * revealed
 */
export interface MinorityDrawMessage extends DrawMessage {
    variant?: MinorityVariant;
    /** The seconds of a vote */
    voteTime?: number;
}

export interface MinorityQuestionMessage extends GameRound, QuestionKey {
    text: string;
}

export interface MinorityCommitMessage extends GameRound, QuestionKey {
    commitment: string;
}

export interface MinorityRevealMessage extends GameRound, QuestionKey {
    vote: Vote;
    salt: string;
}

/** The types of the messages the Minority Game shares with the other games committing then revealing their moves */
export const MINORITY_TYPES = {
    seat: MGGameSessionType.SEAT,
    unseat: MGGameSessionType.UNSEAT,
    draw: MGGameSessionType.DRAW,
    timeout: MGGameSessionType.TIMEOUT,
    rematch: MGGameSessionType.REMATCH,
} as const satisfies CommitRevealTypes;

export interface MinorityPayloads {
    [MGGameSessionType.SEAT]: SeatMessage;
    [MGGameSessionType.UNSEAT]: UnseatMessage;
    [MGGameSessionType.DRAW]: MinorityDrawMessage;
    [MGGameSessionType.QUESTION]: MinorityQuestionMessage;
    [MGGameSessionType.COMMIT]: MinorityCommitMessage;
    [MGGameSessionType.REVEAL]: MinorityRevealMessage;
    [MGGameSessionType.TIMEOUT]: TimeoutMessage;
    [MGGameSessionType.REMATCH]: RematchMessage;
}

export type MinorityMessage = {
    [Type in keyof MinorityPayloads]: AppMessage<Type, MinorityPayloads[Type]>;
}[keyof MinorityPayloads];

export const minorityBlockChains: BlockChainRouting<MinorityPayloads> = {
    [MGGameSessionType.SEAT]: BlockChainName.MINORITY,
    [MGGameSessionType.UNSEAT]: BlockChainName.MINORITY,
    [MGGameSessionType.DRAW]: BlockChainName.MINORITY,
    [MGGameSessionType.QUESTION]: BlockChainName.MINORITY,
    [MGGameSessionType.COMMIT]: BlockChainName.MINORITY,
    [MGGameSessionType.REVEAL]: BlockChainName.MINORITY,
    [MGGameSessionType.TIMEOUT]: BlockChainName.MINORITY,
    [MGGameSessionType.REMATCH]: BlockChainName.MINORITY,
};
