import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { gameEndSound } from '@app/services/sound/game-sounds';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { GameResult } from '../classes/games/game-result';
import { PlayedAction, PlayedActionKind, PlayedTurn } from '../classes/games/played-turn';
import TurnType from '../classes/turns/turn.types';
import { FenPiece } from '../enums/fen-piece.enum';
import { PieceColor } from '../enums/piece-color.enum';
import { PieceType } from '../enums/piece-type.enum';
import ChessBoardHelper from './chess-board-helper';
import { FenBoard } from '../types/fen-board';

/** The game as a page last heard it, then as it is: the turns run since, and what they led to */
export interface HeardTurns {
    readonly played: ReadonlyArray<Readonly<PlayedTurn>>;
    readonly before: FenBoard;
    readonly after: FenBoard;
    readonly result: GameResult | null;
    /** A king in check */
    readonly check: boolean;
    readonly nextTurn: TurnType;
    /** The color of the local player, none for a spectator */
    readonly myColor: PieceColor;
}

type MoveAction = Extract<PlayedAction, { kind: PlayedActionKind.MOVE }>;

function pieceCount(board: FenBoard): number {
    return board.flat().filter((piece: FenPiece) => piece !== FenPiece.EMPTY).length;
}

// The king moved two squares, its rook jumping over it: the king read on the board before the turns heard, its square
// taken by another piece in a later turn heard with it
function isCastling(move: MoveAction, before: FenBoard): boolean {
    return ChessBoardHelper.pieceType(ChessBoardHelper.getFenPiece(before, move.from)) === PieceType.KING
        && ChessBoardHelper.fenCoordinateToVec2(move.from).distanceVec(ChessBoardHelper.fenCoordinateToVec2(move.to)) === 2;
}

/** The most telling sound of the turns run: a check, a promotion, a castling, a capture, then a move. Passes only tell none */
function playedSound({ played, before, after, check }: HeardTurns): OneShotSoundEffect | null {
    const actions: ReadonlyArray<PlayedAction> = played.flatMap(({ white, black }: Readonly<PlayedTurn>) => [white, black])
        .filter((action: PlayedAction | null) => action !== null);
    const moves: ReadonlyArray<MoveAction> = actions.filter((action: PlayedAction): action is MoveAction => action.kind === PlayedActionKind.MOVE);

    if (check) {
        return SoundEffect.CHESS_CHECK;
    }
    if (actions.some((action: PlayedAction) => action.kind === PlayedActionKind.PROMOTION)) {
        return SoundEffect.CHESS_PROMOTION;
    }
    if (moves.some((move: MoveAction) => isCastling(move, before))) {
        return SoundEffect.CHESS_CASTLING;
    }
    if (pieceCount(after) < pieceCount(before)) {
        return SoundEffect.CHESS_CAPTURE;
    }
    return moves.length > 0 ? SoundEffect.CHESS_MOVE : null;
}

/**
 * The sounds of the turns run since a page last heard the game, one after the other: the end of the game alone (won, lost or
 * drawn, for the local player), else the
 * sound of the turns, then the turn starting when it waits for a choice (an intermediate or a promotion turn), or when
 * the turns were passes only, which no other sound tells
 */
export function turnSounds(heard: HeardTurns): ReadonlyArray<OneShotSoundEffect> {
    if (heard.result !== null) {
        const seat = (color: PieceColor): PieceColor | null => color === PieceColor.NONE ? null : color;
        return [gameEndSound(seat(heard.result.winner), seat(heard.myColor))];
    }

    const sound: OneShotSoundEffect | null = playedSound(heard);
    const next: ReadonlyArray<OneShotSoundEffect> = heard.nextTurn === TurnType.MOVE_SYNC ? [] : [SoundEffect.CHESS_TURN_START];
    return sound === null ? [SoundEffect.CHESS_TURN_START] : [sound, ...next];
}
