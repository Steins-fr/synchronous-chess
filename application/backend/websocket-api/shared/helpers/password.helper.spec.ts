import { describe, expect, test } from 'vitest';
import { hashPassword, isPassword, verifyPassword } from './password.helper';

describe('password helper', () => {
    test.each<[string, unknown, boolean]>([
        ['a password', 'secret', true],
        ['the shortest password', 'p'.repeat(6), true],
        ['the longest password', 'p'.repeat(128), true],
        ['an empty password', '', false],
        ['a too short password', 'p'.repeat(5), false],
        ['a too long password', 'p'.repeat(129), false],
        ['a number', 42, false],
        ['no password', undefined, false],
    ])('should tell whether %s is valid', (_case: string, value: unknown, valid: boolean) => {
        expect(isPassword(value)).toEqual(valid);
    });

    test('should verify a password against its hash, salted', () => {
        // When
        const hash: string = hashPassword('secret');

        // Then
        expect(hash).not.toContain('secret');
        expect(hashPassword('secret')).not.toEqual(hash);
        expect(verifyPassword('secret', hash)).toEqual(true);
        expect(verifyPassword('Secret', hash)).toEqual(false);
    });
});
