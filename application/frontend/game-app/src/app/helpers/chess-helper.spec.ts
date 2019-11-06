import ChessHelper from './chess-helper';
import Cell from '../classes/chess/board/cell';
import King from '../classes/chess/piece/pieces/king';
import { PieceColor, PieceFullType } from '../classes/chess/piece/piece';
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
            ]
        ];

        const expectedSimpleBoard: Array<Array<PieceFullType>> = [
            [
                PieceFullType.WHITE_KING,
                PieceFullType.BLACK_KING,
                PieceFullType.WHITE_QUEEN,
                PieceFullType.BLACK_QUEEN
            ],
            [
                PieceFullType.WHITE_ROOK,
                PieceFullType.BLACK_ROOK,
                PieceFullType.WHITE_BISHOP,
                PieceFullType.BLACK_BISHOP
            ],
            [
                PieceFullType.WHITE_KNIGHT,
                PieceFullType.BLACK_KNIGHT,
                PieceFullType.WHITE_PAWN,
                PieceFullType.BLACK_PAWN
            ]
        ];

        // If

        const simpleBoard: Array<Array<PieceFullType>> = ChessHelper.toSimpleBoard(board);

        // Then
        expect(simpleBoard).toEqual(expectedSimpleBoard);
    });

    it('should give us the piece color', () => {
        // Given

        const whitePiece1: PieceFullType = PieceFullType.WHITE_BISHOP;
        const whitePiece2: PieceFullType = PieceFullType.WHITE_KING;
        const whitePiece3: PieceFullType = PieceFullType.WHITE_KNIGHT;
        const whitePiece4: PieceFullType = PieceFullType.WHITE_PAWN;
        const whitePiece5: PieceFullType = PieceFullType.WHITE_QUEEN;
        const whitePiece6: PieceFullType = PieceFullType.WHITE_ROOK;

        const blackPiece1: PieceFullType = PieceFullType.BLACK_BISHOP;
        const blackPiece2: PieceFullType = PieceFullType.BLACK_KING;
        const blackPiece3: PieceFullType = PieceFullType.BLACK_KNIGHT;
        const blackPiece4: PieceFullType = PieceFullType.BLACK_PAWN;
        const blackPiece5: PieceFullType = PieceFullType.BLACK_QUEEN;
        const blackPiece6: PieceFullType = PieceFullType.BLACK_ROOK;

        // If

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

        // If

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
});
