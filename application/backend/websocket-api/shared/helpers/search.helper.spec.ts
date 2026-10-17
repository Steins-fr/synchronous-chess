import { describe, expect, test } from 'vitest';
import { escapeLike, searchKey } from './search.helper';

describe('search helper', () => {
    test('should search a name by its trimmed text in lower case', () => {
        expect(searchKey('  Chat-Lounge ')).toEqual('chat-lounge');
    });

    test('should escape the wildcards of a LIKE pattern, and its escape character', () => {
        expect(escapeLike('100%_a\\b')).toEqual('100\\%\\_a\\\\b');
    });
});
