import { MINORITY_RULES, MinorityVariant } from './minority-rules';
import { MinorityResult, MinorityStanding, placesOf, settleElimination, settleScore } from './standings';
import { describe, expect, test } from 'vitest';

const summary = (standing: MinorityStanding): [number, boolean, number | null, number | null, number | null] =>
    [standing.place, standing.winner, standing.points, standing.eliminatedAt, standing.balance];

describe('placesOf', () => {
    test('should place the highest keys first, equal keys sharing a place', () => {
        // Then
        expect(placesOf([3, 9, 3, -1, 9])).toEqual([3, 1, 3, 5, 1]);
    });
});

describe('settleElimination', () => {
    test('should rank the winner first, taking every stake', () => {
        // When
        const result: MinorityResult = settleElimination([2], [1, 0, null, 1], MINORITY_RULES);

        // Then
        expect(result.variant).toEqual(MinorityVariant.ELIMINATION);
        expect(result.winners).toEqual([2]);
        expect(result.standings.map(summary)).toEqual([
            [2, false, null, 1, -100],
            [4, false, null, 0, -100],
            [1, true, null, null, 300],
            [2, false, null, 1, -100],
        ]);
    });

    test('should share the stakes between 2 winners', () => {
        // When
        const result: MinorityResult = settleElimination([0, 2], [null, 0, null, 0, 0], MINORITY_RULES);

        // Then
        expect(result.winners).toEqual([0, 2]);
        expect(result.standings.map((standing: MinorityStanding) => standing.balance)).toEqual([150, -100, 150, -100, -100]);
    });

    test('should give no winner once every player left is eliminated, every stake lost', () => {
        // When
        const result: MinorityResult = settleElimination([], [2, 2, 0], MINORITY_RULES);

        // Then
        expect(result.winners).toEqual([]);
        expect(result.standings.map(summary)).toEqual([
            [1, false, null, 2, -100],
            [1, false, null, 2, -100],
            [3, false, null, 0, -100],
        ]);
    });
});

describe('settleScore', () => {
    test('should rank by total, equal totals sharing a place and every first winning, without stakes', () => {
        // When
        const result: MinorityResult = settleScore([8, 2, 8, -3]);

        // Then
        expect(result.variant).toEqual(MinorityVariant.SCORE);
        expect(result.winners).toEqual([0, 2]);
        expect(result.standings.map(summary)).toEqual([
            [1, true, 8, null, null],
            [3, false, 2, null, null],
            [1, true, 8, null, null],
            [4, false, -3, null, null],
        ]);
    });
});
