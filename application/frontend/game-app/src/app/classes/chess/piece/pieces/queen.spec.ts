import Queen from './queen';
import Piece, { PieceColor, PieceType } from '../piece';

describe('Queen', () => {
    it('should create an instance', () => {
        expect(new Queen(PieceColor.BLACK)).toBeTruthy();
    });

    it('should initialize properties', () => {
        // Given
        const blackPiece: Piece = new Queen(PieceColor.BLACK);
        const whitePiece: Piece = new Queen(PieceColor.WHITE);

        // Then
        expect(blackPiece.color).toEqual(PieceColor.BLACK);
        expect(blackPiece.type).toEqual(PieceType.QUEEN);
        expect(whitePiece.color).toEqual(PieceColor.WHITE);
        expect(whitePiece.type).toEqual(PieceType.QUEEN);
    });
});
