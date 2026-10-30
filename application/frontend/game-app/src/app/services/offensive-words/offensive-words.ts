/**
 * An entry of a list: lowercase NFC, with the diacritics of its language. Its words are separated by spaces (a hyphen or
 * an apostrophe is a separator too), a trailing `*` makes its last word a stem, and `allow` lists the words it must not
 * mask, with every word starting with them: the whole words matched, folded as the matching folds them but keeping their
 * diacritics (`shit*` allowing `shiitake`, so `shiitakes` and `sh1iitake` too; `pédé` allowing `pede`, not `pédé`)
 */
export type OffensiveWordEntry = string | { readonly word: string; readonly allow: ReadonlyArray<string> };

/** The lists compiled for the matching: opaque to the app */
export interface OffensiveWords {
    /** The patterns by the key of their words: the letters of their runs, the words joined by a space */
    readonly exact: ReadonlyMap<string, ReadonlyArray<Pattern>>;
    /** The same, the key of a stem cut after its stem */
    readonly stems: ReadonlyMap<string, ReadonlyArray<Pattern>>;
    /** The keys of the first words of each phrase: a phrase extends along them only */
    readonly prefixes: ReadonlySet<string>;
    /** The runs of the longest stem */
    readonly longestStem: number;
    /** The runs of the longest pattern of a single word, sought in the words spelled out */
    readonly longestWord: number;
}

/** A letter folded: its base, and its form as written when it bears a diacritic */
interface Letter {
    readonly base: string;
    readonly form?: string;
}

/** A letter as written: a code point and the marks attached to it, folded into one or two letters (ß, æ) */
interface Unit {
    readonly start: number;
    readonly end: number;
    readonly letters: ReadonlyArray<Letter>;
}

/** The same letter repeated, so that `fuuuck` reads as `fuck` */
interface Run {
    readonly base: string;
    count: number;
    /** The forms of its letters bearing a diacritic */
    readonly forms: Set<string>;
    /** The units of its word up to its end */
    units: number;
}

interface Word {
    readonly units: ReadonlyArray<Unit>;
    readonly runs: ReadonlyArray<Readonly<Run>>;
    readonly key: string;
}

interface Pattern {
    readonly words: ReadonlyArray<ReadonlyArray<Readonly<Run>>>;
    /** The runs of its allow-words, their words joined */
    readonly allow: ReadonlyArray<ReadonlyArray<Readonly<Run>>>;
}

/** The units a match covers, word by word */
type Match = ReadonlyArray<ReadonlyArray<Unit>>;

enum CharKind {
    LETTER = 'letter',
    /** A digit or a symbol written for a letter, inside a word holding a real letter */
    LEET = 'leet',
    /** A symbol written for a letter, between two letters only, the next one lowercase */
    INNER_LEET = 'inner-leet',
    /** A mark or an invisible format character, attached to the letter before it */
    MARK = 'mark',
    SEPARATOR = 'separator',
}

/** A letter as read, before it is folded */
interface WrittenLetter {
    readonly char: string;
    written: string;
    readonly start: number;
    end: number;
}

interface CodePoint {
    readonly char: string;
    readonly start: number;
    kind: CharKind;
}

const LETTER = /\p{L}/u;
const LOWERCASE = /\p{Ll}/u;
const MARK = /\p{M}/u;
const ATTACHED = /[\p{M}\p{Cf}]/u;
// Sentence punctuation, or a line break: what a phrase never crosses (`Thanks Jack. Off to bed`)
const SENTENCE_END = /[.!?;:…\n。．！？；：]/u;
/** One code point, a line break excluded: what separates the letters of a word spelled out */
const SPELLING_SEPARATOR = /^.$/u;
/** The single letters spelling a word out, at least */
const SPELLED_LETTERS: number = 3;

const LEET_LETTERS: ReadonlyMap<string, string> = new Map([['0', 'o'], ['1', 'i'], ['3', 'e'], ['4', 'a'], ['5', 's'], ['7', 't'], ['$', 's']]);
// Between two letters only, the next one lowercase: `f!ck`, but `shit!`, `!fuck` and the sentence `whatever!Shit`. Not `@`,
// which glues an address (`bitch@gmail.com`)
const INNER_LEET_LETTERS: ReadonlyMap<string, string> = new Map([['!', 'i']]);

/** The letters NFKD does not fold, by their lowercase form */
const SPECIAL_LETTERS: ReadonlyMap<string, ReadonlyArray<Letter>> = new Map<string, ReadonlyArray<Letter>>([
    // The dotted capital I of Turkish, lowercased into an i and a dot: a plain i
    ['i̇', [{ base: 'i' }]],
    ['ı', [{ base: 'i', form: 'ı' }]],
    ['ł', [{ base: 'l', form: 'ł' }]],
    ['ø', [{ base: 'o', form: 'ø' }]],
    ['đ', [{ base: 'd', form: 'đ' }]],
    ['ß', [{ base: 's', form: 'ß' }, { base: 's', form: 'ß' }]],
    ['æ', [{ base: 'a', form: 'æ' }, { base: 'e', form: 'æ' }]],
    ['œ', [{ base: 'o', form: 'œ' }, { base: 'e', form: 'œ' }]],
    // The same letter as е, both ways: ёбарь and ебарь are one word
    ['ё', [{ base: 'е' }]],
]);

/** A letter and its marks, in NFC, folded: lowercase, its diacritics and compatibility forms (𝐟, ｆ, ﬁ) removed */
function foldLetter(written: string): ReadonlyArray<Letter> {
    const lower: string = written.toLowerCase();
    const special: ReadonlyArray<Letter> | undefined = SPECIAL_LETTERS.get(lower);
    if (special) {
        return special;
    }
    const decomposed: string = lower.normalize('NFKD').toLowerCase();
    const form: string | undefined = MARK.test(decomposed) ? lower : undefined;
    return [...decomposed].filter((char: string) => LETTER.test(char)).map((base: string) => ({ base, form }));
}

function kindOf(char: string): CharKind {
    if (LETTER.test(char)) {
        return CharKind.LETTER;
    }
    if (LEET_LETTERS.has(char)) {
        return CharKind.LEET;
    }
    if (INNER_LEET_LETTERS.has(char)) {
        return CharKind.INNER_LEET;
    }
    return ATTACHED.test(char) ? CharKind.MARK : CharKind.SEPARATOR;
}

/**
 * The digits written for letters are letters in a sequence of letters, digits and marks holding a real
 * letter: `sh1t`, not `100`
 */
function resolveLeet(points: ReadonlyArray<CodePoint>): void {
    let sequence: CodePoint[] = [];
    for (const point of [...points, { char: ' ', start: -1, kind: CharKind.SEPARATOR }]) {
        if (point.kind === CharKind.LETTER || point.kind === CharKind.LEET || point.kind === CharKind.MARK) {
            sequence.push(point);
            continue;
        }
        const kind: CharKind = sequence.some((member: CodePoint) => member.kind === CharKind.LETTER) ? CharKind.LETTER : CharKind.SEPARATOR;
        for (const leet of sequence.filter((member: CodePoint) => member.kind === CharKind.LEET)) {
            leet.kind = kind;
        }
        sequence = [];
    }
}

function resolveInnerLeet(points: ReadonlyArray<CodePoint>): void {
    points.forEach((point: CodePoint, index: number) => {
        if (point.kind === CharKind.INNER_LEET) {
            const next: CodePoint | undefined = points[index + 1];
            const between: boolean = points[index - 1]?.kind === CharKind.LETTER && next?.kind === CharKind.LETTER && LOWERCASE.test(next.char);
            point.kind = between ? CharKind.LETTER : CharKind.SEPARATOR;
        }
    });
}

function codePointsOf(text: string): ReadonlyArray<CodePoint> {
    const points: CodePoint[] = [];
    let start = 0;
    for (const char of text) {
        points.push({ char, start, kind: kindOf(char) });
        start += char.length;
    }
    resolveLeet(points);
    resolveInnerLeet(points);
    return points;
}

/**
 * A letter and a mark following it: a diacritic composing with the letter changes it (NFD), another mark (an overlay, an
 * underline, a variation selector) only lies in it, as an invisible format character (zero-width, soft hyphen) does
 */
function attach(written: string, char: string): string {
    const marked: string = written + char;
    return MARK.test(char) && [...marked.normalize('NFC')].length === 1 ? marked : written;
}

/** The letters of a text as written, word by word: a word is a sequence of letters, whatever separates it */
function unitsOf(text: string): ReadonlyArray<ReadonlyArray<Unit>> {
    const words: WrittenLetter[][] = [];
    let word: WrittenLetter[] = [];
    let letter: WrittenLetter | undefined;
    for (const { char, start, kind } of codePointsOf(text)) {
        if (kind === CharKind.LETTER) {
            if (!letter) {
                word = [];
                words.push(word);
            }
            letter = { char, written: char, start, end: start + char.length };
            word.push(letter);
        } else if (kind === CharKind.MARK && letter) {
            letter.written = attach(letter.written, char);
            letter.end = start + char.length;
        } else {
            letter = undefined;
        }
    }
    return words.map((letters: ReadonlyArray<WrittenLetter>) => letters.map(({ char, written, start, end }: WrittenLetter) => {
        const leet: string | undefined = LEET_LETTERS.get(char) ?? INNER_LEET_LETTERS.get(char);
        return { start, end, letters: leet ? [{ base: leet }] : foldLetter(written.normalize('NFC')) };
    }));
}

function runsOf(units: ReadonlyArray<Unit>): ReadonlyArray<Readonly<Run>> {
    const runs: Run[] = [];
    units.forEach((unit: Unit, index: number) => {
        for (const { base, form } of unit.letters) {
            let run: Run | undefined = runs.at(-1);
            if (run?.base !== base) {
                run = { base, count: 0, forms: new Set(), units: 0 };
                runs.push(run);
            }
            run.count++;
            run.units = index + 1;
            if (form !== undefined) {
                run.forms.add(form);
            }
        }
    });
    return runs;
}

function keyOf(runs: ReadonlyArray<Readonly<Run>>): string {
    return runs.map((run: Readonly<Run>) => run.base).join('');
}

function wordOf(units: ReadonlyArray<Unit>): Word {
    const runs: ReadonlyArray<Readonly<Run>> = runsOf(units);
    return { units, runs, key: keyOf(runs) };
}

/** Three single letters or more, each one apart from the next by a code point (`f.u.c.k`, `f u c k`): a word spelled out */
function spelledOf(text: string, words: ReadonlyArray<ReadonlyArray<Unit>>): ReadonlyArray<ReadonlyArray<Unit>> {
    const spelled: Unit[][] = [];
    let letters: Unit[] = [];
    for (const word of words) {
        const previous: Unit | undefined = letters.at(-1);
        const letter: Unit | undefined = word.length === 1 ? word[0] : undefined;
        if (!letter || !previous || !SPELLING_SEPARATOR.test(text.slice(previous.end, letter.start))) {
            letters = [];
            spelled.push(letters);
        }
        if (letter) {
            letters.push(letter);
        }
    }
    return spelled.filter((run: ReadonlyArray<Unit>) => run.length >= SPELLED_LETTERS);
}

function wordsOf(text: string): { readonly words: ReadonlyArray<Word>; readonly spelled: ReadonlyArray<Word> } {
    const units: ReadonlyArray<ReadonlyArray<Unit>> = unitsOf(text);
    return {
        words: units.map((letters: ReadonlyArray<Unit>) => wordOf(letters)),
        spelled: spelledOf(text, units).map((letters: ReadonlyArray<Unit>) => wordOf(letters)),
    };
}

/**
 * Compiles the lists for the matching, once. An entry is not checked: one with no letter matches nothing, and the
 * lists are checked by their spec, a load never throwing
 */
export function compileOffensiveWords(lists: ReadonlyArray<ReadonlyArray<OffensiveWordEntry>>): OffensiveWords {
    const exact = new Map<string, Pattern[]>();
    const stems = new Map<string, Pattern[]>();
    const prefixes = new Set<string>();
    let longestStem = 0;
    let longestWord = 0;

    for (const entry of lists.flat()) {
        const { word, allow } = typeof entry === 'string' ? { word: entry, allow: [] } : entry;
        const stem: boolean = word.endsWith('*');
        const words: ReadonlyArray<ReadonlyArray<Readonly<Run>>> = wordsOf(stem ? word.slice(0, -1) : word).words.map((folded: Word) => folded.runs);
        const last: ReadonlyArray<Readonly<Run>> | undefined = words.at(-1);
        if (!last) {
            continue;
        }
        const keys: ReadonlyArray<string> = words.map((runs: ReadonlyArray<Readonly<Run>>) => keyOf(runs));
        const key: string = keys.join(' ');
        const patterns: Map<string, Pattern[]> = stem ? stems : exact;
        patterns.set(key, [...patterns.get(key) ?? [], { words, allow: allow.map((allowed: string) => runsOf(unitsOf(allowed).flat())) }]);
        keys.slice(1).forEach((_, index: number) => prefixes.add(keys.slice(0, index + 1).join(' ')));
        longestStem = stem ? Math.max(longestStem, last.length) : longestStem;
        longestWord = words.length === 1 ? Math.max(longestWord, last.length) : longestWord;
    }

    return { exact, stems, prefixes, longestStem, longestWord };
}

/**
 * A run of a text fits a run of a pattern as long or longer, without a diacritic the pattern does not bear: a text may
 * drop the diacritics, never add nor change them (`cono` fits `coño`, `şık` does not fit `sik`)
 */
function fitsRun(run: Readonly<Run>, pattern: Readonly<Run>): boolean {
    return run.count >= pattern.count && [...run.forms].every((form: string) => pattern.forms.has(form));
}

/**
 * A run of a text written as a run of an allow-word: the same letter, as long or longer, bearing the same diacritics
 * (`shiiitake` starts with `shiitake`, `foder` not with `fodder`, nor `pédé` with `pede`)
 */
function writesRun(run: Readonly<Run>, allowed: Readonly<Run>): boolean {
    return run.base === allowed.base && run.count >= allowed.count
        && run.forms.size === allowed.forms.size && [...run.forms].every((form: string) => allowed.forms.has(form));
}

/**
 * Whether words of a text start with an allow-word of a pattern: the whole words the pattern is tried on, a word spelled
 * out included, folded (case, leet, compatibility forms, repeated letters) and joined, their diacritics kept
 */
function allows(pattern: Pattern, words: ReadonlyArray<Word>): boolean {
    if (pattern.allow.length === 0) {
        return false;
    }
    const runs: ReadonlyArray<Readonly<Run>> = runsOf(words.flatMap((word: Word) => word.units));
    return pattern.allow.some((allowed: ReadonlyArray<Readonly<Run>>) =>
        runs.length >= allowed.length && allowed.every((run: Readonly<Run>, index: number) => writesRun(runs[index], run)));
}

/** Whether a pattern matches words of a text, of the same key: a stem on the first runs of its last word */
function accepts(pattern: Pattern, words: ReadonlyArray<Word>): boolean {
    return pattern.words.every((runs: ReadonlyArray<Readonly<Run>>, index: number) =>
        runs.every((run: Readonly<Run>, position: number) => fitsRun(words[index].runs[position], run))) && !allows(pattern, words);
}

function patternsOf(patterns: ReadonlyMap<string, ReadonlyArray<Pattern>>, key: string): ReadonlyArray<Pattern> {
    return patterns.get(key) ?? [];
}

/** The patterns whose key is the one of the words before, then the last one whole or its first runs for a stem */
function candidatesOf(words: OffensiveWords, prefix: string, last: Word): ReadonlyArray<Pattern> {
    const stemLengths: ReadonlyArray<number> = Array.from({ length: Math.min(last.runs.length, words.longestStem) }, (_, index: number) => index + 1);
    return [
        ...patternsOf(words.exact, prefix + last.key),
        ...stemLengths.flatMap((length: number) => patternsOf(words.stems, prefix + keyOf(last.runs.slice(0, length)))),
    ];
}

/** Whether the separators between two words of a text end a sentence */
function endsSentence(text: string, previous: Word, next: Word): boolean {
    return SENTENCE_END.test(text.slice((previous.units.at(-1) as Unit).end, next.units[0].start));
}

/**
 * The words and phrases starting at a word of a text, whatever separates their words (a space, a comma, a hyphen, a
 * quote), but the end of a sentence
 */
function matchesAt(text: string, textWords: ReadonlyArray<Word>, first: number, words: OffensiveWords): ReadonlyArray<Match> {
    const matches: Match[] = [];
    let prefix = '';
    for (let end = first + 1; end <= textWords.length; end++) {
        const phrase: ReadonlyArray<Word> = textWords.slice(first, end);
        const last: Word = textWords[end - 1];
        if (end > first + 1 && endsSentence(text, textWords[end - 2], last)) {
            break;
        }
        if (candidatesOf(words, prefix, last).some((pattern: Pattern) => accepts(pattern, phrase))) {
            matches.push(phrase.map((word: Word) => word.units));
        }
        prefix += last.key;
        if (!words.prefixes.has(prefix)) {
            break;
        }
        prefix += ' ';
    }
    return matches;
}

/**
 * The single word starting a word spelled out: its letters only, `f u c k you` and not `c l a s s`. A stem on its first
 * letters, an exact entry on all of them: `c.u.m.u.l.a.t.i.v.e` is not `cum`. The allow-words apply to all its letters:
 * `s h i i t a k e` is not `shit`
 */
function matchesSpelled(spelled: Word, words: OffensiveWords): ReadonlyArray<Match> {
    const lengths: ReadonlyArray<number> = Array.from({ length: Math.min(spelled.runs.length, words.longestWord) }, (_, index: number) => index + 1);
    return lengths.flatMap((length: number) => {
        const key: string = keyOf(spelled.runs.slice(0, length));
        const match: Match = [spelled.units.slice(0, spelled.runs[length - 1].units)];
        const exact: ReadonlyArray<Pattern> = length === spelled.runs.length ? patternsOf(words.exact, key) : [];
        const patterns: ReadonlyArray<Pattern> = [...exact, ...patternsOf(words.stems, key)];
        return patterns.some((pattern: Pattern) => accepts(pattern, [spelled])) ? [match] : [];
    });
}

/** Every match from every word, overlapping ones included */
function matchesOf(text: string, words: OffensiveWords): ReadonlyArray<Match> {
    const { words: textWords, spelled } = wordsOf(text);
    return [
        ...textWords.flatMap((_, first: number) => matchesAt(text, textWords, first, words)),
        ...spelled.flatMap((word: Word) => matchesSpelled(word, words)),
    ];
}

/**
 * A text with its offensive words masked word by word: the first letter as written, then a `*` for each later letter
 * (its marks dropped), the separators kept: `fils, de pute` shows `f***, d* p***`. The same text when none matches
 */
export function maskOffensiveWords(text: string, words: OffensiveWords): string {
    const masked: ReadonlyArray<Unit> = [...new Set(matchesOf(text, words).flat().flatMap((units: ReadonlyArray<Unit>) => units.slice(1)))]
        .sort((a: Unit, b: Unit) => a.start - b.start);
    let result = '';
    let index = 0;
    for (const unit of masked) {
        result += text.slice(index, unit.start) + '*';
        index = unit.end;
    }
    return result + text.slice(index);
}
