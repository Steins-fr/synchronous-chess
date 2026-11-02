import { SeededRandom } from './seeded-random';
import { describe, expect, test } from 'vitest';

const SEED: string = 'a3cd47f2c3e7b1a8ff6cb04b2ed20b25bc7513837b4eb843db3ad76b68f2c430';
const range = (length: number): number[] => Array.from({ length }, (_, index: number) => index);

// The values come from another implementation of the same draws: every page must shuffle alike
describe('SeededRandom', () => {
    test.each([
        { seed: SEED, items: range(10), shuffled: [4, 2, 5, 0, 1, 3, 8, 9, 6, 7] },
        {
            seed: SEED,
            items: range(52),
            shuffled: [35, 46, 29, 5, 31, 25, 3, 33, 27, 12, 24, 4, 17, 19, 28, 42, 50, 18, 51, 21, 8, 14, 0, 49, 43, 10, 26, 48, 7, 16, 39, 38, 36,
                44, 37, 1, 9, 20, 34, 45, 13, 2, 40, 32, 41, 11, 6, 47, 22, 30, 23, 15],
        },
        { seed: 'other', items: range(10), shuffled: [1, 6, 9, 0, 4, 8, 7, 2, 5, 3] },
    ])('should shuffle $items.length items from the seed $seed', async ({ seed, items, shuffled }) => {
        // When
        const result: number[] = await new SeededRandom(seed).shuffle(items);

        // Then
        expect(result).toEqual(shuffled);
        expect(items).toEqual(range(items.length));
    });

    test('should draw below a bound, again when the bits of the bound give a value beyond it', async () => {
        // Given
        const random = new SeededRandom(SEED);
        const draws: number[] = [];

        // When
        for (let draw = 0; draw < 12; draw++) {
            draws.push(await random.below(3));
        }

        // Then
        expect(draws).toEqual([2, 2, 2, 1, 0, 0, 2, 1, 2, 2, 0, 1]);
    });

    test('should draw on several bytes, up to 2^32', async () => {
        // Given
        const random = new SeededRandom(SEED);

        // Then
        await expect(random.below(1000)).resolves.toEqual(855);
        await expect(random.below(2 ** 32)).resolves.toEqual(3738627974);
        await expect(random.below(300)).resolves.toEqual(40);
    });

    test('should draw 0 below 1, reading no byte', async () => {
        // Given
        const random = new SeededRandom(SEED);

        // Then
        await expect(random.below(1)).resolves.toEqual(0);
        await expect(random.below(1000)).resolves.toEqual(855);
    });

    test.each([0, 1.5, 2 ** 32 + 1])('should refuse the bound %s', async (bound: number) => {
        await expect(new SeededRandom(SEED).below(bound)).rejects.toThrow(`No integer from 0 to ${ bound } excluded`);
    });

    test('should shuffle no item or one item as they are', async () => {
        await expect(new SeededRandom(SEED).shuffle([])).resolves.toEqual([]);
        await expect(new SeededRandom(SEED).shuffle(['a'])).resolves.toEqual(['a']);
    });
});
