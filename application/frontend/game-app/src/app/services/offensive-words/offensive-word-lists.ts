import { compileOffensiveWords, OffensiveWordEntry, OffensiveWords } from './offensive-words';
import de from './lists/de.json';
import en from './lists/en.json';
import es from './lists/es.json';
import fr from './lists/fr.json';
import id from './lists/id.json';
import it from './lists/it.json';
import pl from './lists/pl.json';
import pt from './lists/pt.json';
import ru from './lists/ru.json';
import tr from './lists/tr.json';

/** A list of offensive words, with its credit: served with its words */
export interface OffensiveWordList {
    readonly source: string;
    readonly license: string;
    readonly words: ReadonlyArray<OffensiveWordEntry>;
}

// The lists of every language by their name, loaded together whatever the language of the reader: one chunk, loaded with
// the chat only, never in the main bundle. pt serves both Portuguese
export const offensiveWordLists: Readonly<Record<string, OffensiveWordList>> = { en, fr, es, pt, de, ru, tr, id, pl, it };

/** The offensive words of every list, compiled once */
export const offensiveWords: OffensiveWords = compileOffensiveWords(Object.values(offensiveWordLists).map((list: OffensiveWordList) => list.words));
