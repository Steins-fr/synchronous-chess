import ChessHelper from './chess-helper';
import Cell from '../classes/chess/board/cell';
import King from '../classes/chess/piece/pieces/king';
import { PieceColor, FenPiece } from '../classes/chess/piece/piece';
import Queen from '../classes/chess/piece/pieces/queen';
import Rook from '../classes/chess/piece/pieces/rook';
import Bishop from '../classes/chess/piece/pieces/bishop';
import Knight from '../classes/chess/piece/pieces/knight';
import Pawn from '../classes/chess/piece/pieces/pawn';
import Vec2 from 'vec2';

describe('ChessHelper', () => {
    it('should transform a board into simpleNotation', () => {
        // Given

        const board: Array<Array<Cell>> = [
            [
                new Cell(new King(PieceColor.WHITE)),
                new Cell(new King(PieceColor.BLACK)),
                new Cell(new Queen(PieceColor.WHITE)),
                new Cell(new Queen(PieceColor.BLACK))
            ],
            [
                new Cell(new Rook(PieceColor.WHITE)),
                new Cell(new Rook(PieceColor.BLACK)),
                new Cell(new Bishop(PieceColor.WHITE)),
                new Cell(new Bishop(PieceColor.BLACK))
            ],
            [
                new Cell(new Knight(PieceColor.WHITE)),
                new Cell(new Knight(PieceColor.BLACK)),
                new Cell(new Pawn(PieceColor.WHITE)),
                new Cell(new Pawn(PieceColor.BLACK))
            ],
            [
                new Cell(),
                new Cell(),
                new Cell(),
                new Cell()
            ]
        ];

        const expectedSimpleBoard: Array<Array<FenPiece>> = [
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

        const simpleBoard: Array<Array<FenPiece>> = ChessHelper.toSimpleBoard(board);

        // Then
        expect(simpleBoard).toEqual(expectedSimpleBoard);
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

        // When

        const resultWhite1: PieceColor = ChessHelper.pieceColor(whitePiece1);
        const resultWhite2: PieceColor = ChessHelper.pieceColor(whitePiece2);
        const resultWhite3: PieceColor = ChessHelper.pieceColor(whitePiece3);
        const resultWhite4: PieceColor = ChessHelper.pieceColor(whitePiece4);
        const resultWhite5: PieceColor = ChessHelper.pieceColor(whitePiece5);
        const resultWhite6: PieceColor = ChessHelper.pieceColor(whitePiece6);

        const resultBlack1: PieceColor = ChessHelper.pieceColor(blackPiece1);
        const resultBlack2: PieceColor = ChessHelper.pieceColor(blackPiece2);
        const resultBlack3: PieceColor = ChessHelper.pieceColor(blackPiece3);
        const resultBlack4: PieceColor = ChessHelper.pieceColor(blackPiece4);
        const resultBlack5: PieceColor = ChessHelper.pieceColor(blackPiece5);
        const resultBlack6: PieceColor = ChessHelper.pieceColor(blackPiece6);

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
    });

    it('should give us the piece color', () => {
        // Given

        const positions: Array<Array<Vec2>> = Array(10).fill(null).map((_1: null, y: number) =>
            Array(10).fill(null).map((_2: null, x: number) => new Vec2(x - 1, y - 1))
        );

        // When

        const resultFirstRow: boolean = positions[0].every((vec: Vec2) => ChessHelper.isOutOfBoard(vec) === true);
        const resultLastRow: boolean = positions[9].every((vec: Vec2) => ChessHelper.isOutOfBoard(vec) === true);
        const resultFirstColumn: boolean = positions.every((row: Array<Vec2>) => ChessHelper.isOutOfBoard(row[0]) === true);
        const resultLastColumn: boolean = positions.every((row: Array<Vec2>) => ChessHelper.isOutOfBoard(row[9]) === true);
        const resultBoard: boolean = positions.every((row: Array<Vec2>, y: number) => row.every((vec: Vec2, x: number) => {
            if (x === 0 || y === 0 || x === 9 || y === 9) { // Remove cases tested above
                return true;
            }

            return ChessHelper.isOutOfBoard(vec) === false;
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

        const fenBoard: Array<Array<FenPiece>> = [
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
            (_: any, x: number) => ChessHelper.getFenPiece(fenBoard, new Vec2([x, 0])) === FenPiece.BLACK_BISHOP
        );
        const resultRow2: boolean = fenBoard[1].every(
            (_: any, x: number) => ChessHelper.getFenPiece(fenBoard, new Vec2([x, 1])) === FenPiece.BLACK_KING
        );
        const resultRow3: boolean = fenBoard[2].every(
            (_: any, x: number) => ChessHelper.getFenPiece(fenBoard, new Vec2([x, 2])) === FenPiece.BLACK_KNIGHT
        );
        const resultRow4: boolean = fenBoard[3].every(
            (_: any, x: number) => ChessHelper.getFenPiece(fenBoard, new Vec2([x, 3])) === FenPiece.EMPTY
        );
        const resultRow5: boolean = fenBoard[4].every(
            (_: any, x: number) => ChessHelper.getFenPiece(fenBoard, new Vec2([x, 4])) === FenPiece.EMPTY
        );
        const resultRow6: boolean = fenBoard[5].every(
            (_: any, x: number) => ChessHelper.getFenPiece(fenBoard, new Vec2([x, 5])) === FenPiece.BLACK_PAWN
        );
        const resultRow7: boolean = fenBoard[6].every(
            (_: any, x: number) => ChessHelper.getFenPiece(fenBoard, new Vec2([x, 6])) === FenPiece.BLACK_QUEEN
        );
        const resultRow8: boolean = fenBoard[7].every(
            (_: any, x: number) => ChessHelper.getFenPiece(fenBoard, new Vec2([x, 7])) === FenPiece.BLACK_ROOK
        );

        const resultOut: boolean = vecOutOfBound.every(
            (vec: Vec2) => ChessHelper.getFenPiece(fenBoard, vec) === null
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
});
