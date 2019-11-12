import Cell from '../classes/chess/board/cell';
import { FenPiece, PieceColor, PieceType } from '../classes/chess/piece/piece';
import Vec2 from 'vec2';
import ChessRules from '../classes/chess/rules/chess-rules';

export type FenBoard = Array<Array<FenPiece>>;
export type SafeBoard = Array<Array<boolean>>;
export type MovementBoard = Array<Array<Array<PieceType>>>;

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

export enum Column {
    A = 0,
    B = 1,
    C = 2,
    D = 3,
    E = 4,
    F = 5,
    G = 6,
    H = 7
}

export default abstract class ChessHelper {

    private static readonly fenBoardToSafeBoardCache: Map<FenBoard, SafeBoard> = new Map<FenBoard, SafeBoard>();

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

    public static pieceType(fenPiece: FenPiece): PieceType {
        switch (fenPiece) {
            case FenPiece.BLACK_BISHOP:
            case FenPiece.WHITE_BISHOP:
                return PieceType.BISHOP;
            case FenPiece.BLACK_KING:
            case FenPiece.WHITE_KING:
                return PieceType.KING;
            case FenPiece.BLACK_QUEEN:
            case FenPiece.WHITE_QUEEN:
                return PieceType.QUEEN;
            case FenPiece.BLACK_KNIGHT:
            case FenPiece.WHITE_KNIGHT:
                return PieceType.KNIGHT;
            case FenPiece.BLACK_ROOK:
            case FenPiece.WHITE_ROOK:
                return PieceType.ROOK;
            case FenPiece.BLACK_PAWN:
            case FenPiece.WHITE_PAWN:
                return PieceType.PAWN;
            default:
                return PieceType.NONE;
        }
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

    private static inverseColor(fenPiece: FenPiece): FenPiece {
        return (ChessHelper.pieceColor(fenPiece) === PieceColor.WHITE ? fenPiece.toLowerCase() : fenPiece.toUpperCase()) as FenPiece;
    }

    private static getProtectionPlays(position: Vec2, board: FenBoard, rules: ChessRules): Array<Vec2> {
        const playedPiece: FenPiece = ChessHelper.getFenPiece(board, position);

        // The kings can't enter in the danger perimeter of the other.
        // To prevent recursive movement checks for the king, do not check its possible plays.
        if (ChessHelper.pieceType(playedPiece) === PieceType.KING) {
            return [];
        }

        // Turn all pieces to the same color
        // This permits to simulate the protection of our piece.
        // If we can eat our piece => we can eat the opponent piece which will eat my piece
        const fakeBoard: FenBoard = board.map((row: Array<FenPiece>) => row.map((piece: FenPiece) => {
            if (ChessHelper.pieceColor(piece) !== rules.color) {
                return piece;
            }
            return ChessHelper.inverseColor(piece);
        }));

        // Pawn eat and movements are different. Place fake pieces to force eating over movement.
        if (this.pieceType(playedPiece) === PieceType.PAWN) {
            [
                position.add(0, 1, true), position.add(0, -1, true),
                position.add(1, 1, true), position.add(1, -1, true),
                position.add(-1, 1, true), position.add(-1, -1, true)
            ].forEach((fakePiecePosition: Vec2) => {
                if (ChessHelper.isOutOfBoard(fakePiecePosition) === false) {
                    fakeBoard[fakePiecePosition.y][fakePiecePosition.x] = ChessHelper.getFenPiece(fakeBoard, position);
                }
            });
        }

        // Correct the color of the moving piece
        fakeBoard[position.y][position.x] = playedPiece;

        return rules.getPossiblePlays(ChessHelper.pieceType(ChessHelper.getFenPiece(fakeBoard, position)), position, fakeBoard);
    }


    public static fenBoardToSafeBoard(board: FenBoard, rules: ChessRules): SafeBoard {
        if (ChessHelper.fenBoardToSafeBoardCache.has(board)) {
            return ChessHelper.fenBoardToSafeBoardCache.get(board);
        }

        const safeBoard: SafeBoard = Array(8).fill([]).map(() => Array(8).fill(true));
        let protectionPlays: Array<Vec2> = [];

        board.forEach((row: Array<FenPiece>, y: number) => {
            row.forEach((piece: FenPiece, x: number) => {
                const pieceType: PieceType = ChessHelper.pieceType(piece);
                if (pieceType !== PieceType.NONE && ChessHelper.pieceColor(piece) === rules.color) {
                    protectionPlays = protectionPlays.concat(this.getProtectionPlays(new Vec2([x, y]), board, rules));
                }
            });
        });

        protectionPlays.forEach((play: Vec2) => {
            safeBoard[play.y][play.x] = false;
        });

        ChessHelper.fenBoardToSafeBoardCache.set(board, safeBoard);

        return safeBoard;
    }

    public static castlingRook(from: Vec2, to: Vec2): Column {
        return to.subtract(from, true).x > 0 ? Column.H : Column.A;
    }
}
