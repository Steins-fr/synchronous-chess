import { isQuestionText, QUESTION_MAX_LENGTH } from './question';
import { describe, expect, test } from 'vitest';

describe('isQuestionText', () => {
    test.each([
        ['Will you vote yes?', true],
        ['  Do you like the rain?  ', true],
        ['a'.repeat(QUESTION_MAX_LENGTH), true],
        ['a'.repeat(QUESTION_MAX_LENGTH + 1), false],
        ['', false],
        ['   ', false],
        ['Is https://example.org a nice site?', false],
        ['Did you write to bob@example.org?', false],
        [42, false],
        [undefined, false],
    ])('should tell whether %o is a question', (text: unknown, question: boolean) => {
        // Then
        expect(isQuestionText(text)).toBe(question);
    });
});
