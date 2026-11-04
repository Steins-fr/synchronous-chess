import { AskerDraw, drawAsker } from './asker';
import { describe, expect, test } from 'vitest';

const SEED: string = 'a3cd47f2c3e7b1a8ff6cb04b2ed20b25bc7513837b4eb843db3ad76b68f2c430';
const draw = (round: number, ask: number, candidates: ReadonlyArray<number> = [0, 1, 2, 3, 4, 5, 6, 7]): AskerDraw => ({ round, ask, candidates });

describe('drawAsker', () => {
    test('should draw a candidate alike from the same seed and question', async () => {
        // When
        const asker: number = await drawAsker(SEED, draw(0, 0, [1, 3, 5]));

        // Then
        expect([1, 3, 5]).toContain(asker);
        expect(await drawAsker(SEED, draw(0, 0, [1, 3, 5]))).toEqual(asker);
    });

    test('should draw apart for each question and each asker of a question', async () => {
        // When
        const askers: number[] = await Promise.all([draw(0, 0), draw(1, 0), draw(2, 0), draw(0, 1), draw(0, 2), draw(3, 1)]
            .map((each: AskerDraw) => drawAsker(SEED, each)));

        // Then
        expect(new Set(askers).size).toBeGreaterThan(1);
    });

    test('should draw the only candidate', async () => {
        // Then
        expect(await drawAsker(SEED, draw(4, 2, [6]))).toEqual(6);
    });
});
