import { TestBed } from '@angular/core/testing';
import { Translation } from '@jsverse/transloco';
import { Language } from '@app/services/language/enums/language.enum';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { TranslationLoader } from '@app/services/language/translation.loader';
import { firstValueFrom } from 'rxjs';
import { OffensiveWordList, offensiveWordLists, offensiveWords } from './offensive-word-lists';
import { compileOffensiveWords, findOffensiveWords, maskOffensiveWords, OffensiveWordEntry, OffensiveWords, OffensiveWordSpan } from './offensive-words';
import { describe, expect, test } from 'vitest';

// Lowercase letters and their marks, the words of a phrase separated by a space, a hyphen or an apostrophe, a stem last
const ENTRY_FORM = /^[\p{Ll}\p{M}]+(?:[ '’-][\p{Ll}\p{M}]+)*\*?$/u;

/**
 * Ordinary words of the languages of the app, some close to an offensive word of another list: the curation dropped
 * or allowed them, none is masked
 */
const ORDINARY_WORDS: ReadonlyArray<string> = [
    'I am as I got it, the class assassin had a cocktail in Scunthorpe, sike, a cumulative butt of the moose',
    'summa cum laude, a kitchen-cum-diner, shiitakes, fickler, ficklest, fickly, the white power cable, c.u.m.u.l.a.t.i.v.e',
    'mon ami, quel con… bitte, la balle, un cul-de-sac, une folle journée, ramoner la cheminée, une hure de sanglier',
    'ele pede, fica, comer, burro, mama, bicha, pinto, saco, consolo, porco, uma porra, a boceta de Pandora, uma cadela vadia',
    'con el cono, el pedo, martillo, negro, gol, mona, una concha',
    'nackt, Vögeln, debil, ein Ass, zu dick, wanken, Gott, Mose, Popel, Shiitakepilze',
    'хрен, какая разница, голый, мент',
    'şık, amca, gol, sıkı, sıkın, itil',
    'suka, anjing, tai, asu, Dia lulus cum laude, taik lalat, Mampus, aku lupa, bedebah',
    'jajko, debil, syf, pierdoła, dupa, męki, pieprzyć, nowy tasak, tasakiem',
    'regina, pesce, fava, finocchio, vacca, figa, troika, cazzuola, Troia, scopare, le gote rosse, Verga, una verga, puttanesche',
    'Kike',
];

/** One offensive word or phrase of each list, in the order of the lists */
const OFFENSIVE_SAMPLES: ReadonlyArray<[string, string]> = [
    ['fucking hell', 'f****** hell'],
    ['espèce de connard', 'espèce de c******'],
    ['hijo de puta', 'h*** d* p***'],
    ['vai tomar no cu', 'v** t**** n* c*'],
    ['du Hurensohn', 'du H********'],
    ['иди нахуй', 'иди н****'],
    ['siktir git', 's***** git'],
    ['dasar bangsat', 'dasar b******'],
    ['o kurwa', 'o k****'],
    ['vaffanculo', 'v*********'],
];

function wordOf(entry: OffensiveWordEntry): string {
    return typeof entry === 'string' ? entry : entry.word;
}

function allowOf(entry: OffensiveWordEntry): ReadonlyArray<string> {
    return typeof entry === 'string' ? [] : entry.allow;
}

/** The text an entry masks entirely: the entry without its stem mark */
function textOf(entry: OffensiveWordEntry): string {
    return wordOf(entry).replace(/\*$/, '');
}

/** A text masked entirely, word by word: its first letter, then a star for each letter */
function maskedEntirely(text: string): string {
    return text.replaceAll(/\p{L}+/gu, (word: string) => word[0] + '*'.repeat([...word].length - 1));
}

function flatten(translation: Translation): ReadonlyArray<string> {
    return Object.values(translation).flatMap((value: Translation | string) => typeof value === 'string' ? [value] : flatten(value));
}

describe('The lists of offensive words', () => {
    const lists: ReadonlyArray<[string, OffensiveWordList]> = Object.entries(offensiveWordLists);
    const entries: ReadonlyArray<OffensiveWordEntry> = Object.values(offensiveWordLists).flatMap((list: OffensiveWordList) => list.words);

    test.each(lists)('the list %s should be credited', (_name: string, list: OffensiveWordList) => {
        // Then
        expect(list.source.trim()).not.toEqual('');
        expect(list.license.trim()).not.toEqual('');
    });

    test.each(lists)('the entries of the list %s should be sorted, without duplicate', (_name: string, list: OffensiveWordList) => {
        // When
        const words: ReadonlyArray<string> = list.words.map(wordOf);

        // Then
        expect(new Set(words).size).toEqual(words.length);
        expect(words).toEqual([...words].sort());
    });

    test('every entry should be lowercase NFC, of 3 letters at least', () => {
        // When
        const malformed: ReadonlyArray<string> = entries.map(wordOf).filter((word: string) =>
            !ENTRY_FORM.test(word) || word !== word.normalize('NFC') || (word.match(/\p{L}/gu) ?? []).length < 3);

        // Then
        expect(malformed).toEqual([]);
    });

    test('every entry should mask itself entirely', () => {
        // When
        const unmasked: ReadonlyArray<string> = entries.map(textOf).filter((text: string) =>
            maskOffensiveWords(text, compileOffensiveWords([[text]])) !== maskedEntirely(text));

        // Then
        expect(unmasked).toEqual([]);
    });

    test('every allow-word should be a word its entry would mask', () => {
        // When
        const dead: ReadonlyArray<string> = entries.flatMap((entry: OffensiveWordEntry) => {
            const bare: OffensiveWords = compileOffensiveWords([[wordOf(entry)]]);
            const allowed: OffensiveWords = compileOffensiveWords([[entry]]);
            return allowOf(entry).filter((word: string) =>
                findOffensiveWords(word, bare).length === 0 || findOffensiveWords(word, allowed).length > 0);
        });

        // Then
        expect(dead).toEqual([]);
    });

    test('no exact entry should be masked by a stem already', () => {
        // Given
        const stems: OffensiveWords = compileOffensiveWords([entries.filter((entry: OffensiveWordEntry) => wordOf(entry).endsWith('*'))]);

        // When
        const covered: ReadonlyArray<string> = entries.filter((entry: OffensiveWordEntry) => !wordOf(entry).endsWith('*')).map(textOf)
            .filter((text: string) => maskOffensiveWords(text, stems) === maskedEntirely(text));

        // Then
        expect(covered).toEqual([]);
    });

    test.each([
        ['global', ''],
        ...Object.values(TranslationScope).map((scope: TranslationScope): [string, string] => [scope, `${ scope }/`]),
    ])('no %s text of the app should be masked, in any language', async (_name: string, folder: string) => {
        // Given
        const loader: TranslationLoader = TestBed.inject(TranslationLoader);
        const texts: ReadonlyArray<string> = (await Promise.all(Object.values(Language).map((language: Language) =>
            firstValueFrom(loader.getTranslation(`${ folder }${ language }`))))).flatMap(flatten);

        // When
        const masked: ReadonlyArray<string> = texts.filter((text: string) => findOffensiveWords(text, offensiveWords).length > 0);

        // Then
        expect(masked).toEqual([]);
    });

    test('no ordinary word should be masked', () => {
        // When
        const masked: ReadonlyArray<ReadonlyArray<OffensiveWordSpan>> = ORDINARY_WORDS.map((text: string) => findOffensiveWords(text, offensiveWords));

        // Then
        expect(masked).toEqual(ORDINARY_WORDS.map(() => []));
    });

    test('an offensive word of each list should be masked', () => {
        // When
        const masked: ReadonlyArray<string> = OFFENSIVE_SAMPLES.map(([text]: [string, string]) => maskOffensiveWords(text, offensiveWords));

        // Then
        expect(masked).toEqual(OFFENSIVE_SAMPLES.map(([, expected]: [string, string]) => expected));
    });
});
