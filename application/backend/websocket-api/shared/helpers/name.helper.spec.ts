import { describe, expect, test } from 'vitest';
import { isName } from './name.helper';

describe('name helper', () => {
    test.each<[string, unknown, boolean]>([
        ['a name', 'alice', true],
        ['the longest name', 'a'.repeat(5), true],
        ['an empty name', '', false],
        ['a too long name', 'a'.repeat(6), false],
        ['a number', 42, false],
    ])('should tell whether %s is valid', (_case: string, value: unknown, valid: boolean) => {
        expect(isName(value, 5)).toEqual(valid);
    });
});
