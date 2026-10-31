import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { boardWith } from '@testing/fen-board.helper';
import { describe, expect, test } from 'vitest';
import { GameEndReason } from '../classes/games/game-result';
import { PlayedAction, PlayedActionKind, PlayedTurn } from '../classes/games/played-turn';
import TurnType from '../classes/turns/turn.types';
import { FenPiece } from '../enums/fen-piece.enum';
import { PieceColor } from '../enums/piece-color.enum';
import { PieceType } from '../enums/piece-type.enum';
import { FenColumn, FenCoordinate, FenRow } from '../interfaces/move';
import { FenBoard } from '../types/fen-board';
import { HeardTurns, turnSounds } from './turn-sound.helper';

describe('turnSounds', () => {
    const kings: FenBoard = boardWith({ e1: FenPiece.WHITE_KING, e8: FenPiece.BLACK_KING });
    const pass: PlayedAction = { kind: PlayedActionKind.PASS };

    function move(from: FenCoordinate, to: FenCoordinate): PlayedAction {
        return { kind: PlayedActionKind.MOVE, from, to };
    }

    function syncTurn(white: PlayedAction, black: PlayedAction = pass): PlayedTurn {
        return { number: 1, type: TurnType.MOVE_SYNC, white, black };
    }

    function heard(turns: Partial<HeardTurns>): HeardTurns {
        return { played: [], before: kings, after: kings, result: null, check: false, nextTurn: TurnType.MOVE_SYNC, myColor: PieceColor.WHITE, ...turns };
    }

    const kingMove: PlayedAction = move([FenColumn.E, FenRow._1], [FenColumn.F, FenRow._2]);

    test('should tell a move, or a turn starting once the players passed', () => {
        expect(turnSounds(heard({ played: [syncTurn(kingMove)], after: boardWith({ f2: FenPiece.WHITE_KING, e8: FenPiece.BLACK_KING }) })))
            .toEqual([SoundEffect.CHESS_MOVE]);
        expect(turnSounds(heard({ played: [syncTurn(pass)] }))).toEqual([SoundEffect.CHESS_TURN_START]);
    });

    test('should tell a capture, the pieces fewer', () => {
        // Given
        const before: FenBoard = boardWith({ e1: FenPiece.WHITE_KING, e8: FenPiece.BLACK_KING, f2: FenPiece.BLACK_PAWN });
        const after: FenBoard = boardWith({ f2: FenPiece.WHITE_KING, e8: FenPiece.BLACK_KING });

        // When, Then
        expect(turnSounds(heard({ played: [syncTurn(kingMove)], before, after }))).toEqual([SoundEffect.CHESS_CAPTURE]);
    });

    test('should tell a castling, the king moved two squares, over a capture', () => {
        // Given
        const castling: PlayedAction = move([FenColumn.E, FenRow._1], [FenColumn.G, FenRow._1]);
        const before: FenBoard = boardWith({ e1: FenPiece.WHITE_KING, h1: FenPiece.WHITE_ROOK, e8: FenPiece.BLACK_KING, a2: FenPiece.BLACK_PAWN });
        const after: FenBoard = boardWith({ g1: FenPiece.WHITE_KING, f1: FenPiece.WHITE_ROOK, e8: FenPiece.BLACK_KING });

        // When, Then
        expect(turnSounds(heard({ played: [syncTurn(castling)], before, after }))).toEqual([SoundEffect.CHESS_CASTLING]);
        // A rook moving two squares
        expect(turnSounds(heard({
            played: [syncTurn(move([FenColumn.H, FenRow._1], [FenColumn.F, FenRow._1]))],
            before: boardWith({ e1: FenPiece.WHITE_KING, h1: FenPiece.WHITE_ROOK, e8: FenPiece.BLACK_KING }),
            after: boardWith({ e1: FenPiece.WHITE_KING, f1: FenPiece.WHITE_ROOK, e8: FenPiece.BLACK_KING }),
        }))).toEqual([SoundEffect.CHESS_MOVE]);
        // Heard together: a pawn moving two squares, then the king taking it on its square
        expect(turnSounds(heard({
            played: [
                syncTurn(move([FenColumn.E, FenRow._2], [FenColumn.E, FenRow._4])),
                { number: 1, type: TurnType.MOVE_INTERMEDIATE, white: null, black: move([FenColumn.E, FenRow._5], [FenColumn.E, FenRow._4]) },
            ],
            before: boardWith({ e1: FenPiece.WHITE_KING, e2: FenPiece.WHITE_PAWN, e5: FenPiece.BLACK_KING }),
            after: boardWith({ e1: FenPiece.WHITE_KING, e4: FenPiece.BLACK_KING }),
        }))).toEqual([SoundEffect.CHESS_CAPTURE]);
    });

    test('should tell a promotion over a castling, and a check over the rest', () => {
        // Given
        const promotion: PlayedTurn = {
            number: 1,
            type: TurnType.CHOICE_PROMOTION,
            white: { kind: PlayedActionKind.PROMOTION, square: [FenColumn.A, FenRow._8], piece: PieceType.QUEEN },
            black: null,
        };
        const castled: FenBoard = boardWith({ g1: FenPiece.WHITE_KING, e8: FenPiece.BLACK_KING });
        const castling: PlayedTurn = syncTurn(move([FenColumn.E, FenRow._1], [FenColumn.G, FenRow._1]));

        // When, Then
        expect(turnSounds(heard({ played: [castling, promotion], after: castled }))).toEqual([SoundEffect.CHESS_PROMOTION]);
        expect(turnSounds(heard({ played: [castling, promotion], after: castled, check: true }))).toEqual([SoundEffect.CHESS_CHECK]);
    });

    test('should tell after the turns a turn starting that waits for a choice', () => {
        expect(turnSounds(heard({ played: [syncTurn(kingMove)], nextTurn: TurnType.MOVE_INTERMEDIATE })))
            .toEqual([SoundEffect.CHESS_MOVE, SoundEffect.CHESS_TURN_START]);
        expect(turnSounds(heard({ played: [syncTurn(kingMove)], nextTurn: TurnType.CHOICE_PROMOTION })))
            .toEqual([SoundEffect.CHESS_MOVE, SoundEffect.CHESS_TURN_START]);
        // An intermediate turn passed
        expect(turnSounds(heard({ played: [{ number: 1, type: TurnType.MOVE_INTERMEDIATE, white: pass, black: null }] })))
            .toEqual([SoundEffect.CHESS_TURN_START]);
    });

    test('should tell the end of the game alone, won, lost or drawn for the local player, won for a spectator', () => {
        expect(turnSounds(heard({ played: [syncTurn(kingMove)], check: true, result: { winner: PieceColor.WHITE, reason: GameEndReason.CHECKMATE } })))
            .toEqual([SoundEffect.GAME_WON]);
        expect(turnSounds(heard({ result: { winner: PieceColor.BLACK, reason: GameEndReason.AWAY } }))).toEqual([SoundEffect.GAME_LOST]);
        expect(turnSounds(heard({ result: { winner: PieceColor.BLACK, reason: GameEndReason.CHECKMATE }, myColor: PieceColor.NONE })))
            .toEqual([SoundEffect.GAME_WON]);
        expect(turnSounds(heard({ played: [syncTurn(pass)], result: { winner: PieceColor.NONE, reason: GameEndReason.STALEMATE } })))
            .toEqual([SoundEffect.GAME_DRAW]);
    });
});
