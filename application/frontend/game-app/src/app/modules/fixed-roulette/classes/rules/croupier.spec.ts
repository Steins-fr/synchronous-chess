import { drawCroupier } from './croupier';
import { FIXED_ROULETTE_RULES } from './fixed-roulette-rules';
import { describe, expect, test } from 'vitest';

const SEED: string = 'a3cd47f2c3e7b1a8ff6cb04b2ed20b25bc7513837b4eb843db3ad76b68f2c430';

describe('drawCroupier', () => {
    test('should draw a player alike from the same seed', async () => {
        // When
        const croupier: number = await drawCroupier(SEED, FIXED_ROULETTE_RULES);

        // Then
        expect([0, 1]).toContain(croupier);
        expect(await drawCroupier(SEED, FIXED_ROULETTE_RULES)).toEqual(croupier);
    });

    test('should draw either player from the seeds of the matches', async () => {
        // When
        const croupiers: number[] = await Promise.all(Array.from({ length: 16 }, (_, match: number) => drawCroupier(`${ SEED }:${ match }`, FIXED_ROULETTE_RULES)));

        // Then
        expect(new Set(croupiers)).toEqual(new Set([0, 1]));
    });
});
