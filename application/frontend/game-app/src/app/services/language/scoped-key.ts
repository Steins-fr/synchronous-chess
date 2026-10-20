import { TranslationScope } from './enums/translation-scope.enum';

/**
 * The key of a text of a scope picked by the code, as the app translates it: prefixed with its scope. The keys manager puts
 * a key of the code in the files of a scope only when marker() gets it without its scope, the scope as a literal third
 * argument: scopedKey(TranslationScope.CHESS, marker('game.turn.sync', undefined, 'chess'))
 */
export function scopedKey(scope: TranslationScope, key: string): string {
    return `${ scope }.${ key }`;
}
