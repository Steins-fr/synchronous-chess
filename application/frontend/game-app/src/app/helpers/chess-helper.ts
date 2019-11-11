import Cell from '../classes/chess/board/cell';
import { FenPiece, PieceColor } from '../classes/chess/piece/piece';
import Vec2 from 'vec2';

export type FenBoard = Array<Array<FenPiece>>;

export enum Line {
    _8 = 0,
    _7 = 1,
    _6 = 2,
    _5 = 3,
    _4 = 4,
    _3 = 5,
    _2 = 6,
    _1 = 7
}

export default abstract class ChessHelper {

    public static toSimpleBoard(board: Array<Array<Cell>>): FenBoard {
        return board.map((row: Array<Cell>) => row.map((cell: Cell) => {
            if (cell.piece) {
                return cell.piece.fullType;
            }
            return FenPiece.EMPTY;
        }));
    }

    public static pieceColor(type: FenPiece): PieceColor {
        if (type === FenPiece.EMPTY) {
            return PieceColor.NONE;
        }
        return type >= 'A' && type <= 'Z' ? PieceColor.WHITE : PieceColor.BLACK;
    }

    public static isOutOfBoard(position: Vec2): boolean {
        return (position.x >= 0 && position.y >= 0 && position.x < 8 && position.y < 8) === false;
    }

    /**
     * Return the FenPiece if not out of bound
     */
    public static getFenPiece(board: FenBoard, position: Vec2): FenPiece | null {
        if (ChessHelper.isOutOfBoard(position)) {
            return null;
        }

        return board[position.y][position.x];
    }
}
