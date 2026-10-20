import { describe, expect, test } from 'vitest';
import { TranslationScope } from './enums/translation-scope.enum';
import { scopedKey } from './scoped-key';

describe('scopedKey', () => {
    test('should prefix the key with its scope', () => {
        expect(scopedKey(TranslationScope.CHESS, 'game.turn.sync')).toBe('chess.game.turn.sync');
    });
});
