import King from './king';
import Piece, { PieceColor, PieceType } from '../piece';

describe('King', () => {
    it('should create an instance', () => {
        expect(new King(PieceColor.BLACK)).toBeTruthy();
    });

    it('should initialize properties', () => {
        // Given
        const blackPiece: Piece = new King(PieceColor.BLACK);
        const whitePiece: Piece = new King(PieceColor.WHITE);

        // Then
        expect(blackPiece.color).toEqual(PieceColor.BLACK);
        expect(blackPiece.type).toEqual(PieceType.KING);
        expect(whitePiece.color).toEqual(PieceColor.WHITE);
        expect(whitePiece.type).toEqual(PieceType.KING);
    });
});
