import { EdenResult, EdenStanding, settleEden } from './standings';
import { describe, expect, test } from 'vitest';

const summary = (standing: EdenStanding): [number, boolean, number, number | null] =>
    [standing.place, standing.winner, standing.balance, standing.outAt];

describe('settleEden', () => {
    test('should rank by balance, equal balances sharing a place and every first still in winning', () => {
        // When
        const result: EdenResult = settleEden([800, -100, 800, -900], [null, null, null, 2]);

        // Then
        expect(result.winners).toEqual([0, 2]);
        expect(result.standings.map(summary)).toEqual([
            [1, true, 800, null],
            [3, false, -100, null],
            [1, true, 800, null],
            [4, false, -900, 2],
        ]);
        expect(result.standings.map((standing: EdenStanding) => standing.player)).toEqual([0, 1, 2, 3]);
    });

    test('should give no winner once every player lost paradise, the standings ranking them still', () => {
        // When
        const result: EdenResult = settleEden([-600, -1000, -600], [4, 4, 4]);

        // Then
        expect(result.winners).toEqual([]);
        expect(result.standings.map(summary)).toEqual([
            [1, false, -600, 4],
            [3, false, -1000, 4],
            [1, false, -600, 4],
        ]);
    });
});
