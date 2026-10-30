import { compileOffensiveWords, maskOffensiveWords, OffensiveWords } from './offensive-words';
import { describe, expect, test } from 'vitest';

const WORDS: OffensiveWords = compileOffensiveWords([
    ['fuck*', 'cum', 'ass', 'asshole*', 'cock', 'cunt*', { word: 'shit*', allow: ['shiitake'] }],
    ['fils de pute', 'pute', 'salope', { word: 'pédé', allow: ['pede'] }],
    ['coño', 'puta'],
    ['puta', 'merda'],
    ['scheiße', { word: 'fick*', allow: ['fickle'] }],
    ['ёбарь', "dolboy'eb"],
    ['sik', 'siktir'],
    ['gówno'],
]);

/** The texts masked by the lists of the spec */
function masked(...texts: ReadonlyArray<string>): ReadonlyArray<string> {
    return texts.map((text: string) => maskOffensiveWords(text, WORDS));
}

describe('maskOffensiveWords', () => {
    test('should mask a whole word in any case, its first letter as written', () => {
        expect(masked('fuck', 'Fuck', 'FUCK', 'what the fuck?')).toEqual(['f***', 'F***', 'F***', 'what the f***?']);
    });

    test('should give the same text back when nothing matches', () => {
        // Given
        const text = 'a friendly game';

        // When / Then
        expect(maskOffensiveWords(text, WORDS)).toBe(text);
    });

    test('should never mask inside a longer word', () => {
        expect(masked('assassin', 'class', 'Scunthorpe', 'cocktail', 'cumulative')).toEqual(['assassin', 'class', 'Scunthorpe', 'cocktail', 'cumulative']);
    });

    test('should mask the words starting with a stem, an exact entry the word alone', () => {
        expect(masked('fucking', 'Fuckers', 'cum', 'cums')).toEqual(['f******', 'F******', 'c**', 'cums']);
    });

    test('should leave the words allowed by an entry', () => {
        expect(masked('shiitake', 'shit', 'shitty', 'fickle', 'ficken')).toEqual(['shiitake', 's***', 's*****', 'fickle', 'f*****']);
    });

    test('should leave the words starting with an allow-word, written with invisible characters too', () => {
        expect(masked('shiitakes', 'Shiitakepilze', 'shi\u00ADitake', 'shitakes')).toEqual(['shiitakes', 'Shiitakepilze', 'shi\u00ADitake', 's*******']);
    });

    test('should fold the words as the matching does to compare them with the allow-words', () => {
        expect(masked('shiiitake', 'ＳＨＩＩＴＡＫＥ', 'sh1itake', '$hiitake')).toEqual(['shiiitake', 'ＳＨＩＩＴＡＫＥ', 'sh1itake', '$hiitake']);
    });

    test('should keep the diacritics of the words compared with the allow-words', () => {
        expect(masked('pede', 'PEDE', 'pédé', 'PÉDÉ', 'pe\u0301de\u0301')).toEqual(['pede', 'PEDE', 'p***', 'P***', 'p***']);
    });

    test('should leave the words bearing the diacritics of an allow-word only', () => {
        // Given
        const words: OffensiveWords = compileOffensiveWords([[{ word: 'cul*', allow: ['culé'] }]]);

        // When / Then
        expect(['culé', 'Culés', 'cule', 'culè'].map((text: string) => maskOffensiveWords(text, words))).toEqual(['culé', 'Culés', 'c***', 'c***']);
    });

    test('should compare all the letters of a word spelled out with the allow-words', () => {
        expect(masked('s h i i t a k e', 's.h.i.i.t.a.k.e', 's h i t t y')).toEqual(['s h i i t a k e', 's.h.i.i.t.a.k.e', 's * * * * y']);
    });

    test('should match the lists sharing a word', () => {
        expect(masked('puta', 'merda')).toEqual(['p***', 'm****']);
    });

    test('should mask a phrase word by word, whatever separates its words', () => {
        expect(masked('fils de pute', 'fils, de pute', 'Fils-de-pute')).toEqual(['f*** d* p***', 'f***, d* p***', 'F***-d*-p***']);
    });

    test('should not match a phrase across the end of a sentence or a line', () => {
        expect(masked('fils. de pute', 'fils de! pute', 'fils de? pute', 'fils de; pute', 'fils de: pute', 'fils de… pute', 'fils de\npute', 'fils de。pute'))
            .toEqual(['fils. de p***', 'fils de! p***', 'fils de? p***', 'fils de; p***', 'fils de: p***', 'fils de… p***', 'fils de\np***', 'fils de。p***']);
    });

    test('should match a phrase across quotes and apostrophes', () => {
        expect(masked('fils « de » pute', 'fils "de" pute', "fils 'de' pute", 'fils de pute. Fils de pute'))
            .toEqual(['f*** « d* » p***', 'f*** "d*" p***', "f*** 'd*' p***", 'f*** d* p***. F*** d* p***']);
    });

    test('should not match a phrase missing a word', () => {
        expect(masked('fils pute', 'un fils de', 'fils de toi')).toEqual(['fils p***', 'un fils de', 'fils de toi']);
    });

    test('should mask the union of overlapping phrases', () => {
        // Given
        const words: OffensiveWords = compileOffensiveWords([['aa bb', 'bb cc dd']]);

        // When / Then
        expect(maskOffensiveWords('aa bb cc dd', words)).toEqual('a* b* c* d*');
        expect(maskOffensiveWords('xx aa bb xx', words)).toEqual('xx a* b* xx');
    });

    test('should mask every word and phrase of a text', () => {
        expect(masked('shit, then f u c k and fils de pute')).toEqual(['s***, then f * * * and f*** d* p***']);
    });

    test('should match a text dropping the diacritics of an entry, never adding nor changing them', () => {
        expect(masked('cono', 'coño', 'CONO', 'COÑO')).toEqual(['c***', 'c***', 'C***', 'C***']);
        expect(masked('şık', 'sıktır', 'sik', 'SİKTİR')).toEqual(['şık', 'sıktır', 's**', 'S*****']);
    });

    test('should fold the letters a diacritic does not mark', () => {
        expect(masked('GOWNO', 'scheisse', 'SCHEISSE', 'Scheiße')).toEqual(['G****', 's*******', 'S*******', 'S******']);
    });

    test('should read ё as е, both ways', () => {
        // Given
        const words: OffensiveWords = compileOffensiveWords([['ебарь']]);

        // When / Then
        expect(masked('ебарь', 'ёбарь', 'ЁБАРЬ')).toEqual(['е****', 'ё****', 'Ё****']);
        expect(maskOffensiveWords('ёбарь', words)).toEqual('ё****');
    });

    test('should fold a decomposed text, its marks masked with their letter', () => {
        expect(masked('coño', 'COÑO', 'gówno', 'sl̈ut')).toEqual(['c***', 'C***', 'g****', 'sl̈ut']);
    });

    test('should ignore the marks composing with no letter: overlays, underlines, variation selectors', () => {
        expect(masked('f\u0332u\u0332c\u0332k\u0332', 's\u0336h\u0336i\u0336t\u0336', 'shit\uFE0E', 'fuck\uFE0F', 's\u0327ik'))
            .toEqual(['f\u0332***', 's\u0336***', 's***', 'f***', 's\u0327ik']);
    });

    test('should fold the compatibility forms of the letters', () => {
        expect(masked('𝐟𝐮𝐜𝐤', 'ＦＵＣＫ', 'ﬁls de pute')).toEqual(['𝐟***', 'Ｆ***', 'ﬁ** d* p***']);
    });

    test('should read the digits and symbols written for letters inside a word', () => {
        expect(masked('sh1t', '$hit', 'a$$hole', 'f!ck', 'sh!t', '5h17')).toEqual(['s***', '$***', 'a******', 'f***', 's***', '5***']);
    });

    test('should leave the digits and symbols out of a word', () => {
        expect(masked('5 minutes', 'h3ll0', '100', 'shit!', '!fuck', '@fuck', 'f!!ck')).toEqual(['5 minutes', 'h3ll0', '100', 's***!', '!f***', '@f***', 'f!!ck']);
    });

    test('should read an exclamation mark before a capital as the end of a sentence, and an at sign as a separator', () => {
        expect(masked('whatever!Shit', 'F!CK', 'Fu@k', 'fuck@mail.com')).toEqual(['whatever!S***', 'F!CK', 'Fu@k', 'f***@mail.com']);
    });

    test('should read repeated letters as one, never fewer letters than the entry', () => {
        expect(masked('fuuuck', 'fuuuuck', 'asss', 'as')).toEqual(['f*****', 'f******', 'a***', 'as']);
    });

    test('should mask the letters of a word spelled out', () => {
        expect(masked('f.u.c.k', 'f u c k', 'F-U-C-K', 'f u c k you', 'f u u c k')).toEqual(['f.*.*.*', 'f * * *', 'F-*-*-*', 'f * * * you', 'f * * * *']);
    });

    test('should match a word spelled out from its first letter only', () => {
        expect(masked('c l a s s', 'y a', 'a b c', 'i c u m')).toEqual(['c l a s s', 'y a', 'a b c', 'i c u m']);
    });

    test('should match an exact entry on all the letters spelled out, a stem on the first ones', () => {
        expect(masked('c u m', 'c.u.m.u.l.a.t.i.v.e', 'f.u.c.k.e.r')).toEqual(['c * *', 'c.u.m.u.l.a.t.i.v.e', 'f.*.*.*.e.r']);
    });

    test('should not spell out letters apart by more than one character, or by a line break', () => {
        expect(masked('f  u  c  k', 'f, u, c, k', 'f u\nc k', 'f\nu c k')).toEqual(['f  u  c  k', 'f, u, c, k', 'f u\nc k', 'f\nu c k']);
    });

    test('should mask a word holding invisible characters, with them', () => {
        expect(masked('fu​ck', 'sh­it', '​fuck')).toEqual(['f***', 's***', '​f***']);
    });

    test('should keep the emojis around a word', () => {
        expect(masked('fuck❤️', '👨‍👩‍👧 fuck', '3️⃣ fuck', '😀 fuck')).toEqual(['f***❤️', '👨‍👩‍👧 f***', '3️⃣ f***', '😀 f***']);
    });

    test('should read an apostrophe as a separator', () => {
        expect(masked("dolboy'eb", 'dolboy eb', 'dolboy’eb', 'dolboyeb')).toEqual(["d*****'e*", 'd***** e*', 'd*****’e*', 'dolboyeb']);
    });

    test('should ignore an entry without letters', () => {
        // Given
        const words: OffensiveWords = compileOffensiveWords([['', '*', '...']]);

        // When / Then
        expect(maskOffensiveWords('a text ... *', words)).toEqual('a text ... *');
    });

    test('should end quickly on a long message', () => {
        // Given: 500 single letters, then words
        const letters: string = 'a '.repeat(500);
        const words: string = 'fils de pute salope '.repeat(50);

        // When / Then
        expect(maskOffensiveWords(letters, WORDS)).toEqual(letters);
        expect(maskOffensiveWords(words, WORDS)).toEqual('f*** d* p*** s***** '.repeat(50));
    });
});
