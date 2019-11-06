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

    it('should initialize movements', () => {
        // Given When
        const piece: Piece = new Knight(PieceColor.BLACK);

        // Then
        expect(piece.moves[0].vector.equal(1, 2)).toBeTruthy();
        expect(piece.moves[1].vector.equal(2, 1)).toBeTruthy();
        expect(piece.moves[2].vector.equal(-1, 2)).toBeTruthy();
        expect(piece.moves[3].vector.equal(2, -1)).toBeTruthy();
        expect(piece.moves[4].vector.equal(1, -2)).toBeTruthy();
        expect(piece.moves[5].vector.equal(-2, 1)).toBeTruthy();
        expect(piece.moves[6].vector.equal(-1, -2)).toBeTruthy();
        expect(piece.moves[7].vector.equal(-2, -1)).toBeTruthy();
    });
});
