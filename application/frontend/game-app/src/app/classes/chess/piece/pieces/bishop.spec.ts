import Bishop from './bishop';
import Piece, { PieceColor, PieceType } from '../piece';

describe('Bishop', () => {
    it('should create an instance', () => {
        expect(new Bishop(PieceColor.BLACK)).toBeTruthy();
    });

    it('should initialize properties', () => {
        // Given
        const blackPiece: Piece = new Bishop(PieceColor.BLACK);
        const whitePiece: Piece = new Bishop(PieceColor.WHITE);

        // Then
        expect(blackPiece.color).toEqual(PieceColor.BLACK);
        expect(blackPiece.type).toEqual(PieceType.BISHOP);
        expect(whitePiece.color).toEqual(PieceColor.WHITE);
        expect(whitePiece.type).toEqual(PieceType.BISHOP);
    });

    it('should initialize movements', () => {
        // Given When
        const piece: Piece = new Bishop(PieceColor.BLACK);

        // Then
        expect(piece.moves[0].vector.equal(1, 1)).toBeTruthy();
        expect(piece.moves[1].vector.equal(-1, -1)).toBeTruthy();
        expect(piece.moves[2].vector.equal(1, -1)).toBeTruthy();
        expect(piece.moves[3].vector.equal(-1, 1)).toBeTruthy();
    });
});
