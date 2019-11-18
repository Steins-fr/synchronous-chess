import ChessBoardHelper, { FenBoard, SafeBoard, Column } from './chess-board-helper';
import Vec2 from 'vec2';
import SynchronousChessRules from '../classes/chess/rules/synchronous-chess-rules';
import { FenPiece, PieceColor, PieceType } from '../classes/chess/rules/chess-rules';

describe('ChessHelper', () => {
    it('should clone a board', () => {
        // Given

        const board: FenBoard = [
            [
                FenPiece.WHITE_KING,
                FenPiece.BLACK_KING,
                FenPiece.WHITE_QUEEN,
                FenPiece.BLACK_QUEEN
            ],
            [
                FenPiece.WHITE_ROOK,
                FenPiece.BLACK_ROOK,
                FenPiece.WHITE_BISHOP,
                FenPiece.BLACK_BISHOP
            ],
            [
                FenPiece.WHITE_KNIGHT,
                FenPiece.BLACK_KNIGHT,
                FenPiece.WHITE_PAWN,
                FenPiece.BLACK_PAWN
            ],
            [
                FenPiece.EMPTY,
                FenPiece.EMPTY,
                FenPiece.EMPTY,
                FenPiece.EMPTY
            ]
        ];

        const expectedSimpleBoard: FenBoard = [
            [
                FenPiece.WHITE_KING,
                FenPiece.BLACK_KING,
                FenPiece.WHITE_QUEEN,
                FenPiece.BLACK_QUEEN
            ],
            [
                FenPiece.WHITE_ROOK,
                FenPiece.BLACK_ROOK,
                FenPiece.WHITE_BISHOP,
                FenPiece.BLACK_BISHOP
            ],
            [
                FenPiece.WHITE_KNIGHT,
                FenPiece.BLACK_KNIGHT,
                FenPiece.WHITE_PAWN,
                FenPiece.BLACK_PAWN
            ],
            [
                FenPiece.EMPTY,
                FenPiece.EMPTY,
                FenPiece.EMPTY,
                FenPiece.EMPTY
            ]
        ];

        // When

        const simpleBoard: FenBoard = ChessBoardHelper.clone(board);

        // Then
        expect(simpleBoard).toEqual(expectedSimpleBoard);
        expect(simpleBoard).not.toBe(expectedSimpleBoard);
    });

    it('should give us the piece color', () => {
        // Given

        const whitePiece1: FenPiece = FenPiece.WHITE_BISHOP;
        const whitePiece2: FenPiece = FenPiece.WHITE_KING;
        const whitePiece3: FenPiece = FenPiece.WHITE_KNIGHT;
        const whitePiece4: FenPiece = FenPiece.WHITE_PAWN;
        const whitePiece5: FenPiece = FenPiece.WHITE_QUEEN;
        const whitePiece6: FenPiece = FenPiece.WHITE_ROOK;

        const blackPiece1: FenPiece = FenPiece.BLACK_BISHOP;
        const blackPiece2: FenPiece = FenPiece.BLACK_KING;
        const blackPiece3: FenPiece = FenPiece.BLACK_KNIGHT;
        const blackPiece4: FenPiece = FenPiece.BLACK_PAWN;
        const blackPiece5: FenPiece = FenPiece.BLACK_QUEEN;
        const blackPiece6: FenPiece = FenPiece.BLACK_ROOK;

        const empty: FenPiece = FenPiece.EMPTY;

        // When

        const resultWhite1: PieceColor = ChessBoardHelper.pieceColor(whitePiece1);
        const resultWhite2: PieceColor = ChessBoardHelper.pieceColor(whitePiece2);
        const resultWhite3: PieceColor = ChessBoardHelper.pieceColor(whitePiece3);
        const resultWhite4: PieceColor = ChessBoardHelper.pieceColor(whitePiece4);
        const resultWhite5: PieceColor = ChessBoardHelper.pieceColor(whitePiece5);
        const resultWhite6: PieceColor = ChessBoardHelper.pieceColor(whitePiece6);

        const resultBlack1: PieceColor = ChessBoardHelper.pieceColor(blackPiece1);
        const resultBlack2: PieceColor = ChessBoardHelper.pieceColor(blackPiece2);
        const resultBlack3: PieceColor = ChessBoardHelper.pieceColor(blackPiece3);
        const resultBlack4: PieceColor = ChessBoardHelper.pieceColor(blackPiece4);
        const resultBlack5: PieceColor = ChessBoardHelper.pieceColor(blackPiece5);
        const resultBlack6: PieceColor = ChessBoardHelper.pieceColor(blackPiece6);

        const resultEmpty: PieceColor = ChessBoardHelper.pieceColor(empty);

        // Then
        expect(resultWhite1).toEqual(PieceColor.WHITE);
        expect(resultWhite2).toEqual(PieceColor.WHITE);
        expect(resultWhite3).toEqual(PieceColor.WHITE);
        expect(resultWhite4).toEqual(PieceColor.WHITE);
        expect(resultWhite5).toEqual(PieceColor.WHITE);
        expect(resultWhite6).toEqual(PieceColor.WHITE);

        expect(resultBlack1).toEqual(PieceColor.BLACK);
        expect(resultBlack2).toEqual(PieceColor.BLACK);
        expect(resultBlack3).toEqual(PieceColor.BLACK);
        expect(resultBlack4).toEqual(PieceColor.BLACK);
        expect(resultBlack5).toEqual(PieceColor.BLACK);
        expect(resultBlack6).toEqual(PieceColor.BLACK);

        expect(resultEmpty).toEqual(PieceColor.NONE);
    });

    it('should give us the piece type', () => {
        // Given

        const whitePiece1: FenPiece = FenPiece.WHITE_BISHOP;
        const whitePiece2: FenPiece = FenPiece.WHITE_KING;
        const whitePiece3: FenPiece = FenPiece.WHITE_KNIGHT;
        const whitePiece4: FenPiece = FenPiece.WHITE_PAWN;
        const whitePiece5: FenPiece = FenPiece.WHITE_QUEEN;
        const whitePiece6: FenPiece = FenPiece.WHITE_ROOK;

        const blackPiece1: FenPiece = FenPiece.BLACK_BISHOP;
        const blackPiece2: FenPiece = FenPiece.BLACK_KING;
        const blackPiece3: FenPiece = FenPiece.BLACK_KNIGHT;
        const blackPiece4: FenPiece = FenPiece.BLACK_PAWN;
        const blackPiece5: FenPiece = FenPiece.BLACK_QUEEN;
        const blackPiece6: FenPiece = FenPiece.BLACK_ROOK;

        const empty: FenPiece = FenPiece.EMPTY;

        // When

        const resultWhite1: PieceType = ChessBoardHelper.pieceType(whitePiece1);
        const resultWhite2: PieceType = ChessBoardHelper.pieceType(whitePiece2);
        const resultWhite3: PieceType = ChessBoardHelper.pieceType(whitePiece3);
        const resultWhite4: PieceType = ChessBoardHelper.pieceType(whitePiece4);
        const resultWhite5: PieceType = ChessBoardHelper.pieceType(whitePiece5);
        const resultWhite6: PieceType = ChessBoardHelper.pieceType(whitePiece6);

        const resultBlack1: PieceType = ChessBoardHelper.pieceType(blackPiece1);
        const resultBlack2: PieceType = ChessBoardHelper.pieceType(blackPiece2);
        const resultBlack3: PieceType = ChessBoardHelper.pieceType(blackPiece3);
        const resultBlack4: PieceType = ChessBoardHelper.pieceType(blackPiece4);
        const resultBlack5: PieceType = ChessBoardHelper.pieceType(blackPiece5);
        const resultBlack6: PieceType = ChessBoardHelper.pieceType(blackPiece6);

        const resultEmpty: PieceType = ChessBoardHelper.pieceType(empty);

        // Then
        expect(resultWhite1).toEqual(PieceType.BISHOP);
        expect(resultWhite2).toEqual(PieceType.KING);
        expect(resultWhite3).toEqual(PieceType.KNIGHT);
        expect(resultWhite4).toEqual(PieceType.PAWN);
        expect(resultWhite5).toEqual(PieceType.QUEEN);
        expect(resultWhite6).toEqual(PieceType.ROOK);

        expect(resultBlack1).toEqual(PieceType.BISHOP);
        expect(resultBlack2).toEqual(PieceType.KING);
        expect(resultBlack3).toEqual(PieceType.KNIGHT);
        expect(resultBlack4).toEqual(PieceType.PAWN);
        expect(resultBlack5).toEqual(PieceType.QUEEN);
        expect(resultBlack6).toEqual(PieceType.ROOK);

        expect(resultEmpty).toEqual(PieceType.NONE);
    });

    it('should indicates if a position is out of the board', () => {
        // Given

        const positions: Array<Array<Vec2>> = Array(10).fill(null).map((_1: null, y: number) =>
            Array(10).fill(null).map((_2: null, x: number) => new Vec2(x - 1, y - 1))
        );

        // When

        const resultFirstRow: boolean = positions[0].every((vec: Vec2) => ChessBoardHelper.isOutOfBoard(vec) === true);
        const resultLastRow: boolean = positions[9].every((vec: Vec2) => ChessBoardHelper.isOutOfBoard(vec) === true);
        const resultFirstColumn: boolean = positions.every((row: Array<Vec2>) => ChessBoardHelper.isOutOfBoard(row[0]) === true);
        const resultLastColumn: boolean = positions.every((row: Array<Vec2>) => ChessBoardHelper.isOutOfBoard(row[9]) === true);
        const resultBoard: boolean = positions.every((row: Array<Vec2>, y: number) => row.every((vec: Vec2, x: number) => {
            if (x === 0 || y === 0 || x === 9 || y === 9) { // Remove cases tested above
                return true;
            }

            return ChessBoardHelper.isOutOfBoard(vec) === false;
        }));

        // Then
        expect(resultFirstRow).toBeTruthy();
        expect(resultLastRow).toBeTruthy();
        expect(resultFirstColumn).toBeTruthy();
        expect(resultLastColumn).toBeTruthy();
        expect(resultBoard).toBeTruthy();
    });

    it('should get the right FenPiece', () => {
        // Given

        const fenBoard: FenBoard = [
            Array(8).fill(null).map(() => FenPiece.BLACK_BISHOP),
            Array(8).fill(null).map(() => FenPiece.BLACK_KING),
            Array(8).fill(null).map(() => FenPiece.BLACK_KNIGHT),
            Array(8).fill(null).map(() => FenPiece.EMPTY),
            Array(8).fill(null).map(() => FenPiece.EMPTY),
            Array(8).fill(null).map(() => FenPiece.BLACK_PAWN),
            Array(8).fill(null).map(() => FenPiece.BLACK_QUEEN),
            Array(8).fill(null).map(() => FenPiece.BLACK_ROOK)
        ];

        const vecOutOfBound: Array<Vec2> = [
            new Vec2(-1, 0),
            new Vec2(0, -1),
            new Vec2(8, 0),
            new Vec2(0, 8),
            new Vec2(-1, -1),
            new Vec2(8, 8),
            new Vec2(8, -1),
            new Vec2(-1, 8),
        ];

        // When
        const resultRow1: boolean = fenBoard[0].every(
            (_: any, x: number) => ChessBoardHelper.getFenPiece(fenBoard, new Vec2([x, 0])) === FenPiece.BLACK_BISHOP
        );
        const resultRow2: boolean = fenBoard[1].every(
            (_: any, x: number) => ChessBoardHelper.getFenPiece(fenBoard, new Vec2([x, 1])) === FenPiece.BLACK_KING
        );
        const resultRow3: boolean = fenBoard[2].every(
            (_: any, x: number) => ChessBoardHelper.getFenPiece(fenBoard, new Vec2([x, 2])) === FenPiece.BLACK_KNIGHT
        );
        const resultRow4: boolean = fenBoard[3].every(
            (_: any, x: number) => ChessBoardHelper.getFenPiece(fenBoard, new Vec2([x, 3])) === FenPiece.EMPTY
        );
        const resultRow5: boolean = fenBoard[4].every(
            (_: any, x: number) => ChessBoardHelper.getFenPiece(fenBoard, new Vec2([x, 4])) === FenPiece.EMPTY
        );
        const resultRow6: boolean = fenBoard[5].every(
            (_: any, x: number) => ChessBoardHelper.getFenPiece(fenBoard, new Vec2([x, 5])) === FenPiece.BLACK_PAWN
        );
        const resultRow7: boolean = fenBoard[6].every(
            (_: any, x: number) => ChessBoardHelper.getFenPiece(fenBoard, new Vec2([x, 6])) === FenPiece.BLACK_QUEEN
        );
        const resultRow8: boolean = fenBoard[7].every(
            (_: any, x: number) => ChessBoardHelper.getFenPiece(fenBoard, new Vec2([x, 7])) === FenPiece.BLACK_ROOK
        );

        const resultOut: boolean = vecOutOfBound.every(
            (vec: Vec2) => ChessBoardHelper.getFenPiece(fenBoard, vec) === null
        );

        // Then
        expect(resultRow1).toBeTruthy();
        expect(resultRow2).toBeTruthy();
        expect(resultRow3).toBeTruthy();
        expect(resultRow4).toBeTruthy();
        expect(resultRow5).toBeTruthy();
        expect(resultRow6).toBeTruthy();
        expect(resultRow7).toBeTruthy();
        expect(resultRow8).toBeTruthy();
        expect(resultOut).toBeTruthy();
    });

    it('should build a safe board', () => {
        // Given
        const boardLine: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_BISHOP, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        const safeBoardLine: SafeBoard = [
            [true, false, false, false, false, false, false, false],
            [false, false, false, true, false, false, false, false],
            [false, true, false, false, false, false, true, true],
            [false, false, true, false, false, false, true, true],
            [false, true, true, false, true, true, false, true],
            [false, true, false, false, true, true, true, false],
            [false, false, true, false, true, true, true, true],
            [false, true, true, false, true, true, true, true]
        ];

        const boardHop: FenBoard = [
            [FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_KNIGHT, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_KING, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        const safeBoardHop: SafeBoard = [
            [true, false, true, true, true, true, true, true],
            [true, true, false, false, true, true, true, true],
            [false, true, false, true, true, true, true, true],
            [true, true, false, true, true, true, true, true],
            [true, false, true, true, false, false, false, true],
            [true, true, true, true, false, true, false, true],
            [true, true, true, true, false, false, false, true],
            [true, true, true, true, true, true, true, true]
        ];

        const boardPawn: FenBoard = [
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        // No 'En passant' rule
        const safeBoardPawn: SafeBoard = [
            [true, true, true, true, true, true, true, true],
            [true, true, true, true, true, true, true, true],
            [true, true, false, true, false, true, true, true],
            [true, true, true, true, true, true, true, true],
            [true, true, true, true, true, true, true, true],
            [true, true, true, true, true, true, true, true],
            [true, true, true, true, true, true, true, true],
            [true, true, true, true, true, true, true, true]
        ];

        // When
        const resultLine: SafeBoard = ChessBoardHelper.fenBoardToSafeBoard(boardLine, new SynchronousChessRules(PieceColor.BLACK, true, false, false));
        const resultHop: SafeBoard = ChessBoardHelper.fenBoardToSafeBoard(boardHop, new SynchronousChessRules(PieceColor.BLACK, true, false, false));
        const resultPawn: SafeBoard = ChessBoardHelper.fenBoardToSafeBoard(boardPawn, new SynchronousChessRules(PieceColor.BLACK, true, false, false));

        // Then
        expect(resultLine).toEqual(safeBoardLine);
        expect(resultHop).toEqual(safeBoardHop);
        expect(resultPawn).toEqual(safeBoardPawn);
    });

    it('should indicates the rook targeted by the castling', () => {
        // Given

        const positionFrom: Vec2 = new Vec2([4, 0]);
        const positionTo1: Vec2 = new Vec2([6, 0]);
        const positionTo2: Vec2 = new Vec2([2, 0]);

        // When

        const resultH: Column = ChessBoardHelper.castlingRook(positionFrom, positionTo1);
        const resultA: Column = ChessBoardHelper.castlingRook(positionFrom, positionTo2);

        // Then
        expect(resultH).toEqual(Column.H);
        expect(resultA).toEqual(Column.A);
    });

    it('should create an initialized fen board', () => {
        // Given

        const expectedFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When

        const fenBoard: FenBoard = ChessBoardHelper.createFenBoard();

        // Then
        expect(fenBoard).toEqual(expectedFenBoard);
    });
});
