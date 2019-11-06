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

    it('should initialize movements', () => {
        // Given When
        const piece: Piece = new Queen(PieceColor.BLACK);

        // Then
        expect(piece.moves[0].vector.equal(0, 1)).toBeTruthy();
        expect(piece.moves[1].vector.equal(0, -1)).toBeTruthy();
        expect(piece.moves[2].vector.equal(1, 0)).toBeTruthy();
        expect(piece.moves[3].vector.equal(-1, 0)).toBeTruthy();
        expect(piece.moves[4].vector.equal(1, 1)).toBeTruthy();
        expect(piece.moves[5].vector.equal(-1, -1)).toBeTruthy();
        expect(piece.moves[6].vector.equal(1, -1)).toBeTruthy();
        expect(piece.moves[7].vector.equal(-1, 1)).toBeTruthy();
    });
});
