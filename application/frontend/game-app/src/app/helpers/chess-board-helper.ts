import Vec2 from 'vec2';
import ChessRules, { FenPiece, PieceType, PieceColor } from '../classes/chess/rules/chess-rules';
import Move, { FenCoordinate, FenRow, FenColumn } from '../classes/chess/interfaces/move';
import CoordinateMove, { Row, Column, Coordinate } from '../classes/chess/interfaces/CoordinateMove';

export type FenBoard = Array<Array<FenPiece>>;
export type SafeBoard = Array<Array<boolean>>;
export type ValidPlayBoard = Array<Array<boolean>>;
export type MovementBoard = Array<Array<Array<PieceType>>>;

export default abstract class ChessBoardHelper {

    private static readonly fenBoardToSafeBoardCache: Map<FenBoard, SafeBoard> = new Map<FenBoard, SafeBoard>();

    private static readonly indexRowToFenRowMap: Map<Row, FenRow> = new Map([
        [Row._1, 1],
        [Row._2, 2],
        [Row._3, 3],
        [Row._4, 4],
        [Row._5, 5],
        [Row._6, 6],
        [Row._7, 7],
        [Row._8, 8],
    ]);

    private static readonly fenRowToIndexRowMap: Map<FenRow, Row> = new Map([
        [1, Row._1],
        [2, Row._2],
        [3, Row._3],
        [4, Row._4],
        [5, Row._5],
        [6, Row._6],
        [7, Row._7],
        [8, Row._8],
    ]);

    private static readonly indexColumnToFenColumnMap: Map<Column, FenColumn> = new Map([
        [Column.A, FenColumn.A],
        [Column.B, FenColumn.B],
        [Column.C, FenColumn.C],
        [Column.D, FenColumn.D],
        [Column.E, FenColumn.E],
        [Column.F, FenColumn.F],
        [Column.G, FenColumn.G],
        [Column.H, FenColumn.H],
    ]);

    private static readonly fenColumnToIndexColumnMap: Map<FenColumn, Column> = new Map([
        [FenColumn.A, Column.A],
        [FenColumn.B, Column.B],
        [FenColumn.C, Column.C],
        [FenColumn.D, Column.D],
        [FenColumn.E, Column.E],
        [FenColumn.F, Column.F],
        [FenColumn.G, Column.G],
        [FenColumn.H, Column.H],
    ]);

    public static createFenBoard(): FenBoard {
        return [
            [
                FenPiece.BLACK_ROOK,
                FenPiece.BLACK_KNIGHT,
                FenPiece.BLACK_BISHOP,
                FenPiece.BLACK_QUEEN,
                FenPiece.BLACK_KING,
                FenPiece.BLACK_BISHOP,
                FenPiece.BLACK_KNIGHT,
                FenPiece.BLACK_ROOK
            ],
            Array(8).fill(FenPiece.BLACK_PAWN),
            Array(8).fill(FenPiece.EMPTY),
            Array(8).fill(FenPiece.EMPTY),
            Array(8).fill(FenPiece.EMPTY),
            Array(8).fill(FenPiece.EMPTY),
            Array(8).fill(FenPiece.WHITE_PAWN),
            [
                FenPiece.WHITE_ROOK,
                FenPiece.WHITE_KNIGHT,
                FenPiece.WHITE_BISHOP,
                FenPiece.WHITE_QUEEN,
                FenPiece.WHITE_KING,
                FenPiece.WHITE_BISHOP,
                FenPiece.WHITE_KNIGHT,
                FenPiece.WHITE_ROOK
            ]
        ];
    }

    public static createFilledBoard<T>(value: T): Array<Array<T>> {
        return [
            Array(8).fill(value),
            Array(8).fill(value),
            Array(8).fill(value),
            Array(8).fill(value),
            Array(8).fill(value),
            Array(8).fill(value),
            Array(8).fill(value),
            Array(8).fill(value)
        ];
    }

    public static cloneBoard<T>(board: Array<Array<T>>): Array<Array<T>> {
        return board.map((row: Array<T>) => row.map((value: T) => value));
    }

    public static pieceColor(type: FenPiece): PieceColor {
        if (type === FenPiece.EMPTY) {
            return PieceColor.NONE;
        }
        return type >= 'A' && type <= 'Z' ? PieceColor.WHITE : PieceColor.BLACK;
    }

    public static isOutOfBoard(coordinate: Coordinate): boolean {
        return (coordinate[0] >= Column.A && coordinate[1] >= Row._8 && coordinate[0] <= Column.H && coordinate[1] <= Row._1) === false;
    }

    public static isOutOfBoardByVec(vector: Vec2): boolean {
        return ChessBoardHelper.isOutOfBoard(ChessBoardHelper.vec2ToCoordinate(vector));
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
    public static getFenPieceByVec(board: FenBoard, position: Vec2): FenPiece | null {
        return ChessBoardHelper.getFenPiece(board, ChessBoardHelper.vec2ToFenCoordinate(position));
    }

    /**
     * Return the FenPiece if not out of bound
     */
    public static getFenPiece(board: FenBoard, fenCoordinate: FenCoordinate): FenPiece | null {
        const coordinate: Coordinate = ChessBoardHelper.fenCoordinateToCoordinate(fenCoordinate);
        if (ChessBoardHelper.isOutOfBoard(coordinate)) {
            return null;
        }

        return board[coordinate[1]][coordinate[0]];
    }

    /**
     * Set the piece in a board, then return a new board.
     */
    public static setFenPieceByVec(fenBoard: FenBoard, position: Vec2, piece: FenPiece): FenBoard {
        return ChessBoardHelper.setFenPiece(fenBoard, ChessBoardHelper.vec2ToFenCoordinate(position), piece);
    }

    /**
     * Set the piece in a board, then return a new board.
     */
    public static setFenPiece(fenBoard: FenBoard, fenCoordinate: FenCoordinate, piece: FenPiece): FenBoard {
        const coordinate: Coordinate = ChessBoardHelper.fenCoordinateToCoordinate(fenCoordinate);
        if (ChessBoardHelper.isOutOfBoard(coordinate)) {
            throw new Error(`Updated piece is out of board: ${coordinate.toString()}`);
        }

        const board: FenBoard = ChessBoardHelper.cloneBoard(fenBoard);
        board[coordinate[1]][coordinate[0]] = piece;
        return board;
    }

    private static inverseColor(fenPiece: FenPiece): FenPiece {
        return (ChessBoardHelper.pieceColor(fenPiece) === PieceColor.WHITE ? fenPiece.toLowerCase() : fenPiece.toUpperCase()) as FenPiece;
    }

    private static getProtectionPlays(position: Vec2, board: FenBoard, rules: ChessRules): Array<Vec2> {
        const playedPiece: FenPiece = ChessBoardHelper.getFenPieceByVec(board, position);

        // Turn all pieces to the same color
        // This permits to simulate the protection of our piece.
        // If we can eat our piece => we can eat the opponent piece which will eat my piece
        const fakeBoard: FenBoard = board.map((row: Array<FenPiece>) => row.map((piece: FenPiece) => {
            if (ChessBoardHelper.pieceColor(piece) !== rules.color) {
                return piece;
            }
            return ChessBoardHelper.inverseColor(piece);
        }));

        // Pawn eat and movements are different. Place fake pieces to force eating over movement.
        if (this.pieceType(playedPiece) === PieceType.PAWN) {
            [
                position.add(0, 1, true), position.add(0, -1, true),
                position.add(1, 1, true), position.add(1, -1, true),
                position.add(-1, 1, true), position.add(-1, -1, true)
            ].forEach((fakePiecePosition: Vec2) => {
                const coordinate: Coordinate = [fakePiecePosition.x, fakePiecePosition.y];
                if (ChessBoardHelper.isOutOfBoard(coordinate) === false) {
                    fakeBoard[fakePiecePosition.y][fakePiecePosition.x] = ChessBoardHelper.getFenPieceByVec(fakeBoard, position);
                }
            });
        }

        // Correct the color of the moving piece
        fakeBoard[position.y][position.x] = playedPiece;

        return rules.getPossiblePlays(ChessBoardHelper.pieceType(ChessBoardHelper.getFenPieceByVec(fakeBoard, position)), position, fakeBoard);
    }


    public static fenBoardToSafeBoard(board: FenBoard, rules: ChessRules): SafeBoard {
        if (ChessBoardHelper.fenBoardToSafeBoardCache.has(board)) {
            return ChessBoardHelper.fenBoardToSafeBoardCache.get(board);
        }

        const safeBoard: SafeBoard = Array(8).fill([]).map(() => Array(8).fill(true));
        let protectionPlays: Array<Vec2> = [];

        board.forEach((row: Array<FenPiece>, y: number) => {
            row.forEach((piece: FenPiece, x: number) => {
                const pieceType: PieceType = ChessBoardHelper.pieceType(piece);
                if (pieceType !== PieceType.NONE && ChessBoardHelper.pieceColor(piece) === rules.color) {
                    protectionPlays = protectionPlays.concat(this.getProtectionPlays(new Vec2([x, y]), board, rules));
                }
            });
        });

        protectionPlays.forEach((play: Vec2) => {
            safeBoard[play.y][play.x] = false;
        });

        ChessBoardHelper.fenBoardToSafeBoardCache.set(board, safeBoard);

        return safeBoard;
    }

    public static castlingRook(from: Vec2, to: Vec2): Column {
        return to.subtract(from, true).x > 0 ? Column.H : Column.A;
    }

    public static indexRowToFenRow(index: Row): FenRow {
        return ChessBoardHelper.indexRowToFenRowMap.get(index);
    }

    public static indexColumnToFenColumn(index: Column): FenColumn {
        return ChessBoardHelper.indexColumnToFenColumnMap.get(index);
    }

    public static coordinateToFenCoordinate(coordinate: Coordinate): FenCoordinate {
        return [this.indexColumnToFenColumn(coordinate[0]), this.indexRowToFenRow(coordinate[1])];
    }

    public static fenRowToIndexRow(fenRow: FenRow): Row {
        return ChessBoardHelper.fenRowToIndexRowMap.get(fenRow);
    }

    public static fenColumnToIndexColumn(fenColumn: FenColumn): Column {
        return ChessBoardHelper.fenColumnToIndexColumnMap.get(fenColumn);
    }

    public static fenCoordinateToCoordinate(fenCoordinate: FenCoordinate): Coordinate {
        return [this.fenColumnToIndexColumn(fenCoordinate[0]), this.fenRowToIndexRow(fenCoordinate[1])];
    }

    public static fromMoveToCoordinateMove(move: Move): CoordinateMove {
        return { from: ChessBoardHelper.fenCoordinateToCoordinate(move.from), to: ChessBoardHelper.fenCoordinateToCoordinate(move.to) };
    }

    public static fenCoordinateToVec2(fenCoordinate: FenCoordinate): Vec2 {
        const coordinate: Coordinate = ChessBoardHelper.fenCoordinateToCoordinate(fenCoordinate);
        return new Vec2([coordinate[0], coordinate[1]]);
    }

    public static vec2ToFenCoordinate(vector: Vec2): FenCoordinate {
        return ChessBoardHelper.coordinateToFenCoordinate(ChessBoardHelper.vec2ToCoordinate(vector));
    }

    public static vec2ToCoordinate(vector: Vec2): Coordinate {
        return [vector.x, vector.y];
    }
}
