import { TestBed } from '@angular/core/testing';
import { Translation } from '@jsverse/transloco';
import { MessageFormatTranspiler } from '@jsverse/transloco-messageformat';
import { parse, Token } from '@messageformat/parser';
import { describe, expect, test } from 'vitest';
import { Language } from './enums/language.enum';
import { TranslationScope } from './enums/translation-scope.enum';
import { TranslationLoader } from './translation.loader';

// The translation files of src/i18n, written by npm run i18n:extract: the global ones, then the ones of each scope in its
// folder. Each key in every language, translated
describe('Translations', () => {
    const languages: Language[] = Object.values(Language);
    // The name of the files, then the folder of their path
    const folders: [string, string][] = [
        ['global', ''],
        ...Object.values(TranslationScope).map((scope: TranslationScope): [string, string] => [scope, `${ scope }/`]),
    ];

    function flatten(translation: Translation, prefix: string = ''): Map<string, string> {
        return new Map(Object.entries(translation).flatMap(([key, value]: [string, Translation | string]) =>
            typeof value === 'string' ? [[`${ prefix }${ key }`, value]] : [...flatten(value, `${ prefix }${ key }.`)]));
    }

    // The arguments of an ICU message, those of its plural and select cases included
    function argumentsOf(tokens: Token[]): string[] {
        return tokens.flatMap((token: Token) => {
            switch (token.type) {
                case 'argument':
                case 'function':
                    return [token.arg];
                case 'plural':
                case 'select':
                case 'selectordinal':
                    return [token.arg, ...token.cases.flatMap(({ tokens: caseTokens }) => argumentsOf(caseTokens))];
                default:
                    return [];
            }
        });
    }

    function argumentNames(message: string): string[] {
        return [...new Set(argumentsOf(parse(message)))].sort();
    }

    function tagNames(message: string): string[] {
        return [...message.matchAll(/<\/?([a-z]+)[^>]*>/g)].map(([tag]: RegExpExecArray) => tag).sort();
    }

    describe.each(folders)('the %s translations', (_name: string, folder: string) => {
        async function load(language: Language): Promise<Map<string, string>> {
            return flatten(await TestBed.inject(TranslationLoader).getTranslation(`${ folder }${ language }`));
        }

        test.each(languages)('the keys of %s should be the keys of English', async (language: Language) => {
            // Given
            const english: Map<string, string> = await load(Language.EN);

            // When
            const translation: Map<string, string> = await load(language);

            // Then
            expect([...translation.keys()]).toEqual([...english.keys()]);
        });

        test.each(languages)('every text of %s should be translated', async (language: Language) => {
            // When
            const translation: Map<string, string> = await load(language);

            // Then
            const untranslated: string[] = [...translation].filter(([, text]: [string, string]) =>
                text.trim() === '' || text.startsWith('Missing value for')).map(([key]: [string, string]) => key);
            expect(untranslated).toEqual([]);
        });

        test.each(languages)('every text of %s should be an ICU message of its plural categories', async (language: Language) => {
            // Given
            const transpiler: MessageFormatTranspiler = TestBed.runInInjectionContext(() => new MessageFormatTranspiler({}));
            transpiler.setLocale(language);
            const translation: Map<string, string> = await load(language);

            // When, Then
            translation.forEach((text: string, key: string) => {
                expect(() => transpiler.transpile({ value: text, params: {}, translation: {}, key }), key).not.toThrow();
            });
        });

        test.each(languages)('every text of %s should keep the arguments and the tags of English', async (language: Language) => {
            // Given
            const english: Map<string, string> = await load(Language.EN);

            // When
            const translation: Map<string, string> = await load(language);

            // Then
            translation.forEach((text: string, key: string) => {
                const source: string = english.get(key) ?? '';
                expect(argumentNames(text), key).toEqual(argumentNames(source));
                expect(tagNames(text), key).toEqual(tagNames(source));
            });
        });
    });
});
