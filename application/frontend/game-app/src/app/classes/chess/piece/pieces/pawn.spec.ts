import Pawn from './pawn';
import Piece, { PieceColor, PieceType } from '../piece';

describe('Pawn', () => {
    it('should create an instance', () => {
        expect(new Pawn(PieceColor.BLACK)).toBeTruthy();
    });

    it('should initialize properties', () => {
        // Given
        const blackPiece: Piece = new Pawn(PieceColor.BLACK);
        const whitePiece: Piece = new Pawn(PieceColor.WHITE);

        // Then
        expect(blackPiece.color).toEqual(PieceColor.BLACK);
        expect(blackPiece.type).toEqual(PieceType.PAWN);
        expect(whitePiece.color).toEqual(PieceColor.WHITE);
        expect(whitePiece.type).toEqual(PieceType.PAWN);
    });

    it('should initialize movements', () => {
        // Given When
        const whitePiece: Piece = new Pawn(PieceColor.WHITE);
        const blackPiece: Piece = new Pawn(PieceColor.BLACK);

        // Then
        expect(whitePiece.moves[0].vector.equal(0, -1)).toBeTruthy();
        expect(blackPiece.moves[0].vector.equal(0, 1)).toBeTruthy();
    });
});
