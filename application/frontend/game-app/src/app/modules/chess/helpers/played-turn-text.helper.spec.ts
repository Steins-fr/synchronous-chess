import { describe, expect, test } from 'vitest';
import { PlayedActionKind, PlayedTurn } from '../classes/games/played-turn';
import TurnType from '../classes/turns/turn.types';
import { PieceColor } from '../enums/piece-color.enum';
import { PieceType } from '../enums/piece-type.enum';
import { FenColumn, FenRow } from '../interfaces/move';
import { translated } from '@testing/translatable-text.helper';
import { playedTurnLines } from './played-turn-text.helper';

describe('playedTurnLines', () => {
    const turns: ReadonlyArray<PlayedTurn> = [
        {
            number: 1,
            type: TurnType.MOVE_SYNC,
            white: { kind: PlayedActionKind.MOVE, from: [FenColumn.C, FenRow._3], to: [FenColumn.D, FenRow._5] },
            black: { kind: PlayedActionKind.MOVE, from: [FenColumn.D, FenRow._8], to: [FenColumn.D, FenRow._7] },
        },
        { number: 1, type: TurnType.MOVE_INTERMEDIATE, white: null, black: { kind: PlayedActionKind.MOVE, from: [FenColumn.D, FenRow._7], to: [FenColumn.D, FenRow._5] } },
        { number: 1, type: TurnType.MOVE_INTERMEDIATE, white: { kind: PlayedActionKind.PASS }, black: null },
        {
            number: 2,
            type: TurnType.CHOICE_PROMOTION,
            white: { kind: PlayedActionKind.PROMOTION, square: [FenColumn.A, FenRow._8], piece: PieceType.QUEEN },
            black: { kind: PlayedActionKind.PROMOTION, square: [FenColumn.H, FenRow._1], piece: PieceType.KNIGHT },
        },
    ];

    test('should give the keys of the actions, with their params', () => {
        expect(playedTurnLines(turns.slice(1, 3))).toEqual([
            { key: 'chess.game.history.pass', params: { turn: 1, kind: TurnType.MOVE_INTERMEDIATE, color: PieceColor.WHITE } },
            { key: 'chess.game.history.move', params: { turn: 1, kind: TurnType.MOVE_INTERMEDIATE, color: PieceColor.BLACK, from: 'D7', to: 'D5' } },
        ]);
    });

    test('should tell a line per color involved, white first, the latest turn first', () => {
        expect(playedTurnLines(turns).map(translated)).toEqual([
            'Turn 2 · White promotes on A8 to a queen',
            'Turn 2 · Black promotes on H1 to a knight',
            'Turn 1 (intermediate) · White passes',
            'Turn 1 (intermediate) · Black: D7 → D5',
            'Turn 1 · White: C3 → D5',
            'Turn 1 · Black: D8 → D7',
        ]);
    });

    test('should tell nothing before the first turn', () => {
        expect(playedTurnLines([])).toEqual([]);
    });
});
