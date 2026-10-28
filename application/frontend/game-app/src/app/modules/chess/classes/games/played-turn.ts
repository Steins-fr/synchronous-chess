import { FenCoordinate } from '../../interfaces/move';
import { PieceType } from '../../enums/piece-type.enum';
import TurnType from '../turns/turn.types';

export enum PlayedActionKind {
    MOVE = 'move',
    PASS = 'pass',
    PROMOTION = 'promotion',
}

/** What a color played in a turn: a move, a pass, or the piece its pawn became */
export type PlayedAction =
    | { readonly kind: PlayedActionKind.MOVE; readonly from: FenCoordinate; readonly to: FenCoordinate }
    | { readonly kind: PlayedActionKind.PASS }
    | { readonly kind: PlayedActionKind.PROMOTION; readonly square: FenCoordinate; readonly piece: PieceType };

/** A turn run, for the history of the game */
export interface PlayedTurn {
    /** The number of its synchronous turn, from 1: an intermediate or a promotion turn keeps the one of the turn before */
    readonly number: number;
    readonly type: TurnType;
    /** The action of each color, null for a color not involved: no target in an intermediate turn, no pawn to promote */
    readonly white: PlayedAction | null;
    readonly black: PlayedAction | null;
}
