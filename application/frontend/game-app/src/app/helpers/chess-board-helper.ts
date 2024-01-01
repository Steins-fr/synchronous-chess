import CoordinateMove, { Row, Column, Coordinate } from '@app/classes/chess/interfaces/CoordinateMove';
import Move, { FenCoordinate, FenRow, FenColumn } from '@app/classes/chess/interfaces/move';
import ChessRules, { FenPiece, PieceType, PieceColor } from '@app/classes/chess/rules/chess-rules';
import { Vec2 } from '@app/classes/vector/vec2';

export type FenBoard = Array<Array<FenPiece>>;
export type SafeBoard = Array<Array<boolean>>;
export type ValidPlayBoard = Array<Array<boolean>>;
export type MovementBoard = Array<Array<Array<PieceType>>>;

export class InvalidFenCoordinateError extends Error {
    public constructor(type: 'column' | 'row', index: number | string) {
        super(`Invalid ${type} index: ${index}`);
    }
}

export default abstract class ChessBoardHelper {

    private static readonly fenBoardToSafeBoardCache: Map<string, SafeBoard> = new Map<string, SafeBoard>();
    private static isCacheDisabled: boolean = false;

    private static readonly indexRowToFenRowMap: Map<Row, FenRow> = new Map([
        [Row._1, FenRow._1],
        [Row._2, FenRow._2],
        [Row._3, FenRow._3],
        [Row._4, FenRow._4],
        [Row._5, FenRow._5],
        [Row._6, FenRow._6],
        [Row._7, FenRow._7],
        [Row._8, FenRow._8]
    ]);

    private static readonly fenRowToIndexRowMap: Map<FenRow, Row> = new Map([
        [FenRow._1, Row._1],
        [FenRow._2, Row._2],
        [FenRow._3, Row._3],
        [FenRow._4, Row._4],
        [FenRow._5, Row._5],
        [FenRow._6, Row._6],
        [FenRow._7, Row._7],
        [FenRow._8, Row._8]
    ]);

    private static readonly indexColumnToFenColumnMap: Map<Column, FenColumn> = new Map([
        [Column.A, FenColumn.A],
        [Column.B, FenColumn.B],
        [Column.C, FenColumn.C],
        [Column.D, FenColumn.D],
        [Column.E, FenColumn.E],
        [Column.F, FenColumn.F],
        [Column.G, FenColumn.G],
        [Column.H, FenColumn.H]
    ]);

    private static readonly fenColumnToIndexColumnMap: Map<FenColumn, Column> = new Map([
        [FenColumn.A, Column.A],
        [FenColumn.B, Column.B],
        [FenColumn.C, Column.C],
        [FenColumn.D, Column.D],
        [FenColumn.E, Column.E],
        [FenColumn.F, Column.F],
        [FenColumn.G, Column.G],
        [FenColumn.H, Column.H]
    ]);

    private static readonly fenPieceToPieceTypeMap: Map<FenPiece, PieceType> = new Map([
        [FenPiece.BLACK_BISHOP, PieceType.BISHOP],
        [FenPiece.WHITE_BISHOP, PieceType.BISHOP],
        [FenPiece.BLACK_KING, PieceType.KING],
        [FenPiece.WHITE_KING, PieceType.KING],
        [FenPiece.BLACK_QUEEN, PieceType.QUEEN],
        [FenPiece.WHITE_QUEEN, PieceType.QUEEN],
        [FenPiece.BLACK_KNIGHT, PieceType.KNIGHT],
        [FenPiece.WHITE_KNIGHT, PieceType.KNIGHT],
        [FenPiece.BLACK_ROOK, PieceType.ROOK],
        [FenPiece.WHITE_ROOK, PieceType.ROOK],
        [FenPiece.BLACK_PAWN, PieceType.PAWN],
        [FenPiece.WHITE_PAWN, PieceType.PAWN]
    ]);

    private static readonly whitePromotionPieces: Map<PieceType, FenPiece> = new Map<PieceType, FenPiece>([
        [PieceType.BISHOP, FenPiece.WHITE_BISHOP],
        [PieceType.KNIGHT, FenPiece.WHITE_KNIGHT],
        [PieceType.QUEEN, FenPiece.WHITE_QUEEN],
        [PieceType.ROOK, FenPiece.WHITE_ROOK]
    ]);

    private static readonly blackPromotionPieces: Map<PieceType, FenPiece> = new Map<PieceType, FenPiece>([
        [PieceType.BISHOP, FenPiece.BLACK_BISHOP],
        [PieceType.KNIGHT, FenPiece.BLACK_KNIGHT],
        [PieceType.QUEEN, FenPiece.BLACK_QUEEN],
        [PieceType.ROOK, FenPiece.BLACK_ROOK]
    ]);

    private constructor() { }

    public static createFenBoard(): FenBoard {
        const rowSize: number = 8;

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
            Array(rowSize).fill(FenPiece.BLACK_PAWN),
            Array(rowSize).fill(FenPiece.EMPTY),
            Array(rowSize).fill(FenPiece.EMPTY),
            Array(rowSize).fill(FenPiece.EMPTY),
            Array(rowSize).fill(FenPiece.EMPTY),
            Array(rowSize).fill(FenPiece.WHITE_PAWN),
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
        const rowSize: number = 8;
        return [
            Array(rowSize).fill(value),
            Array(rowSize).fill(value),
            Array(rowSize).fill(value),
            Array(rowSize).fill(value),
            Array(rowSize).fill(value),
            Array(rowSize).fill(value),
            Array(rowSize).fill(value),
            Array(rowSize).fill(value)
        ];
    }

    // Mandatory for Unit test concurrency
    public static disableCache(): void {
        ChessBoardHelper.isCacheDisabled = true;
    }

    // Mandatory for Unit test concurrency
    public static enableCache(): void {
        ChessBoardHelper.isCacheDisabled = false;
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
        return !(coordinate[0] >= Column.A && coordinate[1] >= Row._8 && coordinate[0] <= Column.H && coordinate[1] <= Row._1);
    }

    public static isOutOfBoardByVec(vector: Vec2): boolean {
        return ChessBoardHelper.isOutOfBoard(ChessBoardHelper.vec2ToCoordinate(vector));
    }

    public static pieceType(fenPiece: FenPiece): PieceType {
        return ChessBoardHelper.fenPieceToPieceTypeMap.get(fenPiece) ?? PieceType.NONE;
    }

    /**
     * Return the FenPiece if not out of bound
     *
     * @throws InvalidFenCoordinateError if the position is out of bound
     */
    public static getFenPieceByVec(board: FenBoard, position: Vec2): FenPiece {
        return ChessBoardHelper.getFenPiece(board, ChessBoardHelper.vec2ToFenCoordinate(position));
    }

    /**
     * Return the FenPiece if not out of bound
     *
     * @throws InvalidFenCoordinateError if the position is out of bound
     */
    public static getFenPiece(board: FenBoard, fenCoordinate: FenCoordinate): FenPiece {
        const coordinate: Coordinate = ChessBoardHelper.fenCoordinateToCoordinate(fenCoordinate);

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

    public static promote(fenBoard: FenBoard, fenCoordinate: FenCoordinate, pieceType: PieceType, pieceColor: PieceColor): FenBoard {
        const pieceMap: Map<PieceType, FenPiece> = pieceColor === PieceColor.WHITE ? ChessBoardHelper.whitePromotionPieces : ChessBoardHelper.blackPromotionPieces;

        const piece: FenPiece | undefined = pieceMap.get(pieceType);

        if (!piece) {
            return ChessBoardHelper.cloneBoard(fenBoard);
        }

        return ChessBoardHelper.setFenPiece(fenBoard, fenCoordinate, piece);
    }

    private static inverseColor(fenPiece: FenPiece): FenPiece {
        return (ChessBoardHelper.pieceColor(fenPiece) === PieceColor.WHITE ? fenPiece.toLowerCase() : fenPiece.toUpperCase()) as FenPiece;
    }

    private static getProtectionPlays(position: Vec2, board: FenBoard, rules: ChessRules): Array<Vec2> {
        const playedPiece = ChessBoardHelper.getFenPieceByVec(board, position);

        // Turn all pieces to the same color
        // This permits to simulate the protection of our piece.
        // If we can eat our piece => we can eat the opponent piece which will eat my piece
        const fakeBoard: FenBoard = board.map((row: Array<FenPiece>) => row.map((piece: FenPiece) => {
            if (ChessBoardHelper.pieceColor(piece) !== rules.color) {
                return piece;
            }
            return ChessBoardHelper.inverseColor(piece);
        }));

        const fakeBoardPiece = !ChessBoardHelper.isOutOfBoardByVec(position) ? ChessBoardHelper.getFenPieceByVec(fakeBoard, position) : FenPiece.EMPTY;

        // Pawn eat and movements are different. Place fake pieces to force eating over movement.
        if (this.pieceType(playedPiece) === PieceType.PAWN) {
            [
                position.add(0, 1), position.add(0, -1),
                position.add(1, 1), position.add(1, -1),
                position.add(-1, 1), position.add(-1, -1)
            ].forEach((fakePiecePosition: Vec2) => {
                const coordinate: Coordinate = [fakePiecePosition.x, fakePiecePosition.y];
                if (!ChessBoardHelper.isOutOfBoard(coordinate)) {
                    fakeBoard[fakePiecePosition.y][fakePiecePosition.x] = fakeBoardPiece;
                }
            });
        }

        // Correct the color of the moving piece
        fakeBoard[position.y][position.x] = playedPiece;

        return rules.getPossiblePlays(ChessBoardHelper.pieceType(fakeBoardPiece), position, fakeBoard);
    }


    public static fenBoardToSafeBoard(board: FenBoard, rules: ChessRules, excludeFrom?: FenCoordinate): SafeBoard {
        let cacheKey: string = board.toString() + rules.color;
        let excludeFromCoordinate: Vec2;
        if (excludeFrom !== undefined) {
            cacheKey += excludeFrom.toString();
            excludeFromCoordinate = ChessBoardHelper.fenCoordinateToVec2(excludeFrom);
        }

        if (ChessBoardHelper.fenBoardToSafeBoardCache.has(cacheKey) && !ChessBoardHelper.isCacheDisabled) {
            return ChessBoardHelper.fenBoardToSafeBoardCache.get(cacheKey) ?? [];
        }

        const size: number = 8;
        const safeBoard: SafeBoard = Array(size).fill([]).map(() => Array(size).fill(true));
        let protectionPlays: Array<Vec2> = [];

        board.forEach((row: Array<FenPiece>, y: number) => {
            row.forEach((piece: FenPiece, x: number) => {
                const pieceType: PieceType = ChessBoardHelper.pieceType(piece);
                // Exclude results for this piece
                if (excludeFromCoordinate?.equal(x, y)) {
                    return;
                }

                if (pieceType !== PieceType.NONE && ChessBoardHelper.pieceColor(piece) === rules.color) {
                    protectionPlays = protectionPlays.concat(this.getProtectionPlays(new Vec2(x, y), board, rules));
                }
            });
        });

        protectionPlays.forEach((play: Vec2) => {
            safeBoard[play.y][play.x] = false;
        });

        ChessBoardHelper.fenBoardToSafeBoardCache.set(cacheKey, safeBoard);

        return safeBoard;
    }

    public static isSafe(safeBoard: SafeBoard, fenCoordinate: FenCoordinate): boolean {
        const coordinate: Coordinate = ChessBoardHelper.fenCoordinateToCoordinate(fenCoordinate);
        return safeBoard[coordinate[1]][coordinate[0]];
    }

    public static castlingRook(from: Vec2, to: Vec2): Column {
        return to.subVec(from).x > 0 ? Column.H : Column.A;
    }

    /**
     * @throws InvalidFenCoordinateError if the index is out of bound
     */
    public static indexRowToFenRow(index: Row): FenRow {
        const row: FenRow | undefined = ChessBoardHelper.indexRowToFenRowMap.get(index);

        if (row === undefined) {
            throw new InvalidFenCoordinateError('row', index);
        }

        return row;
    }

    /**
     * @throws InvalidFenCoordinateError if the index is out of bound
     */
    public static indexColumnToFenColumn(index: Column): FenColumn {
        const column: FenColumn | undefined = ChessBoardHelper.indexColumnToFenColumnMap.get(index);

        if (column === undefined) {
            throw new InvalidFenCoordinateError('column', index);
        }

        // TODO: Replace map by object
        return column;
    }

    /**
     * @throws InvalidFenCoordinateError if the coordinate is out of bound
     */
    public static coordinateToFenCoordinate(coordinate: Coordinate): FenCoordinate {
        return [this.indexColumnToFenColumn(coordinate[0]), this.indexRowToFenRow(coordinate[1])];
    }

    /**
     * @throws InvalidFenCoordinateError if the coordinate is out of bound
     */
    public static fenRowToIndexRow(fenRow: FenRow): Row {
        const row: Row | undefined = ChessBoardHelper.fenRowToIndexRowMap.get(fenRow);

        if (row === undefined) {
            throw new InvalidFenCoordinateError('row', fenRow);
        }

        return row;
    }

    /**
     * @throws InvalidFenCoordinateError if the coordinate is out of bound
     */
    public static fenColumnToIndexColumn(fenColumn: FenColumn): Column {
        const column: Column | undefined = ChessBoardHelper.fenColumnToIndexColumnMap.get(fenColumn);

        if (column === undefined) {
            throw new InvalidFenCoordinateError('column', fenColumn);
        }

        return column;
    }

    /**
     * @throws InvalidFenCoordinateError if the coordinate is out of bound
     */
    public static fenCoordinateToCoordinate(fenCoordinate: FenCoordinate): Coordinate {
        return [this.fenColumnToIndexColumn(fenCoordinate[0]), this.fenRowToIndexRow(fenCoordinate[1])];
    }

    /**
     * @throws InvalidFenCoordinateError if the coordinate is out of bound
     */
    public static fromMoveToCoordinateMove(move: Move): CoordinateMove {
        return { from: ChessBoardHelper.fenCoordinateToCoordinate(move.from), to: ChessBoardHelper.fenCoordinateToCoordinate(move.to) };
    }

    /**
     * @throws InvalidFenCoordinateError if the coordinate is out of bound
     */
    public static fromCoordinateMoveToMove(move: CoordinateMove): Move {
        return { from: ChessBoardHelper.coordinateToFenCoordinate(move.from), to: ChessBoardHelper.coordinateToFenCoordinate(move.to) };
    }

    /**
     * @throws InvalidFenCoordinateError if the coordinate is out of bound
     */
    public static fenCoordinateToVec2(fenCoordinate: FenCoordinate): Vec2 {
        const coordinate: Coordinate = ChessBoardHelper.fenCoordinateToCoordinate(fenCoordinate);
        return new Vec2(coordinate[0], coordinate[1]);
    }

    /**
     * @throws InvalidFenCoordinateError if the coordinate is out of bound
     */
    public static vec2ToFenCoordinate(vector: Vec2): FenCoordinate {
        return ChessBoardHelper.coordinateToFenCoordinate(ChessBoardHelper.vec2ToCoordinate(vector));
    }

    public static vec2ToCoordinate(vector: Vec2): Coordinate {
        return [vector.x, vector.y];
    }

    public static findKing(fenBoard: FenBoard, king: FenPiece.BLACK_KING | FenPiece.WHITE_KING): FenCoordinate {
        let kingCoordinate: Coordinate | null = null;
        fenBoard.forEach((row: Array<FenPiece>, y: number) => {
            row.forEach((piece: FenPiece, x: number) => {
                if (piece === king) {
                    kingCoordinate = [x, y];
                }
            });
        });

        if (!kingCoordinate) {
            throw new Error('No king on the board!');
        }

        return ChessBoardHelper.coordinateToFenCoordinate(kingCoordinate);
    }
}
