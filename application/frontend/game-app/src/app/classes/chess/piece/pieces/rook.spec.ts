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

    it('should initialize movements', () => {
        // Given When
        const piece: Piece = new Rook(PieceColor.BLACK);

        // Then
        expect(piece.moves[0].vector.equal(0, 1)).toBeTruthy();
        expect(piece.moves[1].vector.equal(0, -1)).toBeTruthy();
        expect(piece.moves[2].vector.equal(1, 0)).toBeTruthy();
        expect(piece.moves[3].vector.equal(-1, 0)).toBeTruthy();
    });
});
