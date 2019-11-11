import SynchronousChessBlackRules from './synchronous-chess-black-rules';
import FearHopMove from '../moves/fear-hop-move';
import { FenPiece } from '../piece/piece';

describe('SynchronousChessBlackRules', () => {
    it('should create an instance', () => {
        expect(new SynchronousChessBlackRules()).toBeTruthy();
    });

    it('should initialize rook movements', () => {
        // Given When
        const rules: SynchronousChessBlackRules = new SynchronousChessBlackRules();

        // Then
        expect(rules.rookMove[0].vector.equal(0, 1)).toBeTruthy();
        expect(rules.rookMove[1].vector.equal(0, -1)).toBeTruthy();
        expect(rules.rookMove[2].vector.equal(1, 0)).toBeTruthy();
        expect(rules.rookMove[3].vector.equal(-1, 0)).toBeTruthy();
    });

    it('should initialize queen movements', () => {
        // Given When
        const rules: SynchronousChessBlackRules = new SynchronousChessBlackRules();

        // Then
        expect(rules.queenMove[0].vector.equal(0, 1)).toBeTruthy();
        expect(rules.queenMove[1].vector.equal(0, -1)).toBeTruthy();
        expect(rules.queenMove[2].vector.equal(1, 0)).toBeTruthy();
        expect(rules.queenMove[3].vector.equal(-1, 0)).toBeTruthy();
        expect(rules.queenMove[4].vector.equal(1, 1)).toBeTruthy();
        expect(rules.queenMove[5].vector.equal(-1, -1)).toBeTruthy();
        expect(rules.queenMove[6].vector.equal(1, -1)).toBeTruthy();
        expect(rules.queenMove[7].vector.equal(-1, 1)).toBeTruthy();
    });

    it('should initialize pawn movements', () => {
        // Given When
        const rules: SynchronousChessBlackRules = new SynchronousChessBlackRules();

        // Then
        expect(rules.pawnMove[0].vector.equal(0, 1)).toBeTruthy();
    });

    it('should initialize knight movements', () => {
        // Given When
        const rules: SynchronousChessBlackRules = new SynchronousChessBlackRules();

        // Then
        expect(rules.knightMove[0].vector.equal(1, 2)).toBeTruthy();
        expect(rules.knightMove[1].vector.equal(2, 1)).toBeTruthy();
        expect(rules.knightMove[2].vector.equal(-1, 2)).toBeTruthy();
        expect(rules.knightMove[3].vector.equal(2, -1)).toBeTruthy();
        expect(rules.knightMove[4].vector.equal(1, -2)).toBeTruthy();
        expect(rules.knightMove[5].vector.equal(-2, 1)).toBeTruthy();
        expect(rules.knightMove[6].vector.equal(-1, -2)).toBeTruthy();
        expect(rules.knightMove[7].vector.equal(-2, -1)).toBeTruthy();
    });

    it('should initialize king movements', () => {
        // Given When
        const rules: SynchronousChessBlackRules = new SynchronousChessBlackRules();

        // Then
        expect(rules.kingMove[0].vector.equal(0, 1)).toBeTruthy();
        expect(rules.kingMove[1].vector.equal(0, -1)).toBeTruthy();
        expect(rules.kingMove[2].vector.equal(1, 0)).toBeTruthy();
        expect(rules.kingMove[3].vector.equal(-1, 0)).toBeTruthy();
        expect(rules.kingMove[4].vector.equal(1, 1)).toBeTruthy();
        expect(rules.kingMove[5].vector.equal(-1, -1)).toBeTruthy();
        expect(rules.kingMove[6].vector.equal(1, -1)).toBeTruthy();
        expect(rules.kingMove[7].vector.equal(-1, 1)).toBeTruthy();
        expect(rules.kingMove.every((move: FearHopMove) => move.dontApproche === FenPiece.WHITE_KING));
    });

    it('should initialize bishop movements', () => {
        // Given When
        const rules: SynchronousChessBlackRules = new SynchronousChessBlackRules();

        // Then
        expect(rules.bishopMove[0].vector.equal(1, 1)).toBeTruthy();
        expect(rules.bishopMove[1].vector.equal(-1, -1)).toBeTruthy();
        expect(rules.bishopMove[2].vector.equal(1, -1)).toBeTruthy();
        expect(rules.bishopMove[3].vector.equal(-1, 1)).toBeTruthy();
    });
});
