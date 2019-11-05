import Rook from './rook';
import Piece, { PieceColor, PieceType } from '../piece';

describe('Rook', () => {
    it('should create an instance', () => {
        expect(new Rook(PieceColor.BLACK)).toBeTruthy();
    });

    it('should initialize properties', () => {
        // Given
        const blackPiece: Piece = new Rook(PieceColor.BLACK);
        const whitePiece: Piece = new Rook(PieceColor.WHITE);

        // Then
        expect(blackPiece.color).toEqual(PieceColor.BLACK);
        expect(blackPiece.type).toEqual(PieceType.ROOK);
        expect(whitePiece.color).toEqual(PieceColor.WHITE);
        expect(whitePiece.type).toEqual(PieceType.ROOK);
    });
});
