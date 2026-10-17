import { describe, expect, test } from 'vitest';
import { isName, isText } from './text.helper';

describe('text helper', () => {
    test.each<[string, unknown, number, boolean]>([
        ['a text', 'text', 1, true],
        ['the longest text', 'a'.repeat(5), 1, true],
        ['a text of spaces', '  ', 1, true],
        ['an empty text', '', 1, false],
        ['an empty text allowed', '', 0, true],
        ['a too long text', 'a'.repeat(6), 1, false],
        ['a text with the NUL character', 'a\u0000b', 1, false],
        ['a number', 42, 1, false],
        ['nothing', undefined, 0, false],
    ])('should tell whether %s is valid', (_case: string, value: unknown, minLength: number, valid: boolean) => {
        expect(isText(value, 5, minLength)).toEqual(valid);
    });

    test.each<[string, unknown, boolean]>([
        ['a name', 'alice', true],
        ['the longest name', 'a'.repeat(5), true],
        ['a name between spaces', ' bob ', true],
        ['an empty name', '', false],
        ['a name of spaces', '   ', false],
        ['a too long name', 'a'.repeat(6), false],
        ['a number', 42, false],
    ])('should tell whether %s is a valid name', (_case: string, value: unknown, valid: boolean) => {
        expect(isName(value, 5)).toEqual(valid);
    });
});
