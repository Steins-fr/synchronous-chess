import { commitmentOf, drawSalt, isCommitment } from './commitment';
import { describe, expect, test } from 'vitest';

describe('commitment', () => {
    test.each([
        { parts: [0, 'w', '{"kind":"move","move":null}', 'salt'], separator: ' ' as const, commitment: '8761b3a5f16a26dfd1b2906df79c09b9b0628949fa1136d7074d03e1a87bea84' },
        { parts: ['one', 'two'], separator: ':' as const, commitment: 'a3cd47f2c3e7b1a8ff6cb04b2ed20b25bc7513837b4eb843db3ad76b68f2c430' },
    ])('should commit to the parts $parts joined by "$separator"', async ({ parts, separator, commitment }) => {
        await expect(commitmentOf(parts, separator)).resolves.toEqual(commitment);
    });

    test.each([
        { value: 'a3cd47f2c3e7b1a8ff6cb04b2ed20b25bc7513837b4eb843db3ad76b68f2c430', expected: true },
        { value: 'A3CD47F2C3E7B1A8FF6CB04B2ED20B25BC7513837B4EB843DB3AD76B68F2C430', expected: false },
        { value: 'a3cd47f2c3e7b1a8ff6cb04b2ed20b25bc7513837b4eb843db3ad76b68f2c43', expected: false },
        { value: 42, expected: false },
    ])('should tell whether $value is a commitment', ({ value, expected }) => {
        expect(isCommitment(value)).toBe(expected);
    });

    test('should draw a salt of 16 random bytes', () => {
        expect(drawSalt()).toMatch(/^[0-9a-f]{32}$/);
        expect(drawSalt()).not.toEqual(drawSalt());
    });
});
