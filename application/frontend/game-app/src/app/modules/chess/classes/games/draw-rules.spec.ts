import { DrawRules } from './draw-rules';
import { GameEndReason } from './game-result';
import ChessBoardHelper from '../../helpers/chess-board-helper';
import { FenPiece } from '../../enums/fen-piece.enum';
import Move, { FenColumn, FenRow } from '../../interfaces/move';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { boardWith } from '@testing/fen-board.helper';
import { describe, expect, test } from 'vitest';

const kings: Record<string, FenPiece> = { e1: FenPiece.WHITE_KING, e8: FenPiece.BLACK_KING };
const g1f3: Move = { from: [FenColumn.G, FenRow._1], to: [FenColumn.F, FenRow._3] };
const e2e4: Move = { from: [FenColumn.E, FenRow._2], to: [FenColumn.E, FenRow._4] };

describe('DrawRules', () => {
    test.each<{ name: string; pieces: Record<string, FenPiece>; insufficient: boolean }>([
        { name: 'the kings alone', pieces: {}, insufficient: true },
        { name: 'a single knight', pieces: { b1: FenPiece.WHITE_KNIGHT }, insufficient: true },
        { name: 'a single bishop', pieces: { c8: FenPiece.BLACK_BISHOP }, insufficient: true },
        { name: 'bishops on squares of the same color', pieces: { c1: FenPiece.WHITE_BISHOP, f8: FenPiece.BLACK_BISHOP, a3: FenPiece.WHITE_BISHOP }, insufficient: true },
        { name: 'bishops on squares of both colors', pieces: { c1: FenPiece.WHITE_BISHOP, c8: FenPiece.BLACK_BISHOP }, insufficient: false },
        { name: 'two knights', pieces: { b1: FenPiece.WHITE_KNIGHT, g1: FenPiece.WHITE_KNIGHT }, insufficient: false },
        { name: 'a knight and a bishop', pieces: { b1: FenPiece.WHITE_KNIGHT, c1: FenPiece.WHITE_BISHOP }, insufficient: false },
        { name: 'a pawn', pieces: { a2: FenPiece.WHITE_PAWN }, insufficient: false },
        { name: 'a rook', pieces: { a8: FenPiece.BLACK_ROOK }, insufficient: false },
        { name: 'a queen', pieces: { d1: FenPiece.WHITE_QUEEN }, insufficient: false },
    ])('should find whether $name can checkmate', ({ pieces, insufficient }) => {
        // When
        const board: FenBoard = boardWith({ ...kings, ...pieces });

        // Then
        expect(DrawRules.isInsufficientMaterial(board)).toEqual(insufficient);
        expect(new DrawRules().draw(board)).toEqual(insufficient ? GameEndReason.INSUFFICIENT_MATERIAL : null);
    });

    test('should not end the starting position', () => {
        // Given
        const rules: DrawRules = new DrawRules();

        // When
        rules.recordPosition(ChessBoardHelper.createFenBoard(), '1111');

        // Then
        expect(rules.draw(ChessBoardHelper.createFenBoard())).toBeNull();
    });

    test('should draw when the same position starts a synchronous turn for the third time', () => {
        // Given
        const rules: DrawRules = new DrawRules();
        const board: FenBoard = ChessBoardHelper.createFenBoard();

        // When
        rules.recordPosition(board, '1111');
        rules.recordPosition(board, '1111');

        // Then
        expect(rules.draw(board)).toBeNull();

        // When the same pieces, with other castling rights, are another position
        rules.recordPosition(board, '0011');

        // Then
        expect(rules.draw(board)).toBeNull();

        // When
        rules.recordPosition(board, '1111');

        // Then
        expect(rules.draw(board)).toEqual(GameEndReason.THREEFOLD_REPETITION);
    });

    test('should draw after 50 synchronous turns without a pawn move nor a capture', () => {
        // Given
        const rules: DrawRules = new DrawRules();
        const board: FenBoard = ChessBoardHelper.createFenBoard();
        rules.recordPosition(board, 'start');

        // When 49 quiet turns are played, each one to another position
        for (let turn = 1; turn < 50; turn++) {
            rules.recordMoves(board, board, [g1f3]);
            rules.recordPosition(board, `turn ${ turn }`);
        }

        // Then
        expect(rules.draw(board)).toBeNull();

        // When
        rules.recordPosition(board, 'turn 50');

        // Then
        expect(rules.draw(board)).toEqual(GameEndReason.FIFTY_TURNS);
    });

    test('should start the history again after a pawn move or a capture, not after a refused pawn move', () => {
        // Given a position played twice
        const rules: DrawRules = new DrawRules();
        const board: FenBoard = ChessBoardHelper.createFenBoard();
        const afterPawnMove: FenBoard = ChessBoardHelper.setFenPiece(ChessBoardHelper.setFenPiece(board, e2e4.to, FenPiece.WHITE_PAWN), e2e4.from, FenPiece.EMPTY);
        const afterCapture: FenBoard = ChessBoardHelper.setFenPiece(afterPawnMove, [FenColumn.A, FenRow._7], FenPiece.EMPTY);
        rules.recordPosition(board, '1111');
        rules.recordPosition(board, '1111');

        // When a pawn move is refused, the board staying the same
        rules.recordMoves(board, board, [e2e4]);
        rules.recordPosition(board, '1111');

        // Then
        expect(rules.draw(board)).toEqual(GameEndReason.THREEFOLD_REPETITION);

        // When a pawn moves
        rules.recordMoves(board, afterPawnMove, [e2e4]);
        rules.recordPosition(afterPawnMove, '1111');
        rules.recordPosition(afterPawnMove, '1111');

        // Then the former positions are forgotten
        expect(rules.draw(afterPawnMove)).toBeNull();

        // When a piece is captured
        rules.recordMoves(afterPawnMove, afterCapture, [g1f3]);
        rules.recordPosition(afterCapture, '1111');
        rules.recordPosition(afterCapture, '1111');

        // Then
        expect(rules.draw(afterCapture)).toBeNull();
    });
});
