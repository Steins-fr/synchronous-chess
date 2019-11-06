import King from './king';
import Piece, { PieceColor, PieceType, FenPiece } from '../piece';
import FearHopMove from '../../moves/fear-hop-move';

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

    it('should initialize movements', () => {
        // Given When
        const whitePiece: Piece = new King(PieceColor.WHITE);
        const blackPiece: Piece = new King(PieceColor.BLACK);

        // Then
        expect(whitePiece.moves[0].vector.equal(0, 1)).toBeTruthy();
        expect(whitePiece.moves[1].vector.equal(0, -1)).toBeTruthy();
        expect(whitePiece.moves[2].vector.equal(1, 0)).toBeTruthy();
        expect(whitePiece.moves[3].vector.equal(-1, 0)).toBeTruthy();
        expect(whitePiece.moves[4].vector.equal(1, 1)).toBeTruthy();
        expect(whitePiece.moves[5].vector.equal(-1, -1)).toBeTruthy();
        expect(whitePiece.moves[6].vector.equal(1, -1)).toBeTruthy();
        expect(whitePiece.moves[7].vector.equal(-1, 1)).toBeTruthy();
        expect(whitePiece.moves.every((move: FearHopMove) => move.dontApproche === FenPiece.BLACK_KING));
        expect(blackPiece.moves.every((move: FearHopMove) => move.dontApproche === FenPiece.WHITE_KING));
    });
});
