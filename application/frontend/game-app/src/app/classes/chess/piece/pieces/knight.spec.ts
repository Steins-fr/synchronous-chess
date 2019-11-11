import Knight from './knight';
import Piece, { PieceColor, PieceType } from '../piece';

describe('Knight', () => {
    it('should create an instance', () => {
        expect(new Knight(PieceColor.BLACK)).toBeTruthy();
    });

    it('should initialize properties', () => {
        // Given
        const blackPiece: Piece = new Knight(PieceColor.BLACK);
        const whitePiece: Piece = new Knight(PieceColor.WHITE);

        // Then
        expect(blackPiece.color).toEqual(PieceColor.BLACK);
        expect(blackPiece.type).toEqual(PieceType.KNIGHT);
        expect(whitePiece.color).toEqual(PieceColor.WHITE);
        expect(whitePiece.type).toEqual(PieceType.KNIGHT);
    });
});
