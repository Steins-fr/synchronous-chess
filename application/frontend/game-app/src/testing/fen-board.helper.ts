import { FenPiece } from '@app/modules/chess/enums/fen-piece.enum';
import { FenBoard } from '@app/modules/chess/types/fen-board';

/** A board with the given pieces only, by their square (e.g. `{ e1: FenPiece.WHITE_KING }`) */
export function boardWith(pieces: Readonly<Record<string, FenPiece>>): FenBoard {
    const board: FenBoard = Array.from({ length: 8 }, () => new Array<FenPiece>(8).fill(FenPiece.EMPTY));
    Object.entries(pieces).forEach(([square, piece]) => {
        board[8 - Number(square[1])][square.charCodeAt(0) - 'a'.charCodeAt(0)] = piece;
    });
    return board;
}
