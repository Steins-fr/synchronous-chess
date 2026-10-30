# Lists of offensive words

The chat masks the words of these lists (`f***`), on display only, while its option is on. Every list applies to
every message, whatever the language of the reader or of the author: a word of one list must not be an ordinary word
in another language. The lists are not translations: they do not follow the files of `src/i18n`.

Each file holds its credit, served with the lists:

```json
{
  "source": "<title, URL, pinned version>",
  "license": "<licence and changes>",
  "words": ["…"]
}
```

`pt` serves both Portuguese (Brazil and Portugal). `offensive-word-lists.spec.ts` checks the files: the shape, the
form and the order of the entries, the stems and the allow-words, and that no text of the app is masked.

## Credits

### List of Dirty, Naughty, Obscene, and Otherwise Bad Words

`en`, `fr`, `es`, `pt`, `de`, `ru`, `tr`, `pl` and `it`.

- © 2012–2020 Shutterstock, Inc. and the LDNOOBW contributors,
  <https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words>, commit
  `5faf2ba42d7b1c0977169ec3611df25a3c08eb13`.
- Licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0),
  <https://creativecommons.org/licenses/by/4.0/>.
- Changes: entries removed, inflections merged into stems, allow-words added, lowercased; a few inflections and
  compounds added (`jackass`, `dumbass`), the accents of Portuguese restored, and for Russian the spellings without
  apostrophe and the Cyrillic forms of a few transliterations added. The `license` of each file tells its changes.

### indonesian-badwords

`id`, which LDNOOBW does not have.

- drizki/indonesian-badwords, <https://github.com/drizki/indonesian-badwords>, npm `2.6.0`, `data/catalog.json`
  (reviewed on 2026-10-29).
- Changes: the variants of the `reviewed-core` profile with a severity of 2 or more selected, then reviewed by hand
  (entries removed, inflections merged into stems).
- The catalog declares no human review (`"humanReviewed": false`, `"nativeReviewed": false`, `"method":
  "ai-source-review"`): the selection below is the hand review of this list. A pass of a native speaker is welcome.
- Licensed under the MIT License:

```text
MIT License

Copyright (c) 2022 Dwi Rizki Irawan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Entries

- Lowercase NFC, with the diacritics of the language (`coño`, `scheiß*`, `gówno`, `enculé*`): a text may drop them
  (`cono`, `gowno`), not add nor change them (`şık` is not `sik`). No digit, symbol nor emoji, 3 letters at least: the
  matcher reads the leet (`sh1t`), the repeated letters (`fuuuck`) and the words spelled out (`f.u.c.k`) by itself.
- The leet: a digit or a `$` is a letter in a word holding a real letter (`sh1t`, `a$$hole`, not `100`), a `!` between
  two letters only, the next one lowercase (`f!ck`, but `whatever!Shit` ends a sentence). `@` is a separator, never a
  letter: `bitch@gmail.com` masks `bitch` only.
- An entry matches whole words only: `cock` does not mask `cocktail`, nor `fag` the Polish `fagot`. Spelled out, the
  same: `c.o.c.k.t.a.i.l` is not masked.
- A phrase separates its words by a space (`fils de pute`). A hyphen or an apostrophe is a separator too, in the
  entries as in the texts: `foda-se` matches `foda se`, `dolboy'eb` matches `dolboy eb`, and `dolboyeb` is listed
  apart. The separators of a text between the words of a phrase can be anything but the end of a sentence or a line:
  a space, a comma, a hyphen, an apostrophe or a quote keeps the phrase (`fils, de pute`), a `.`, `!`, `?`, `;`, `:`,
  `…` (or their fullwidth forms) or a line break ends it (`Thanks Jack. Off to bed` is not `jack off`).
- A trailing `*` marks a stem of 3 letters at least: it matches every word starting with it (`fuck*`: fucking,
  fucker). A stem is allowed only when no ordinary word of the eleven languages (en, fr, es, pt, de, ru, tr, id, pl,
  it) starts with it, else its forms are listed (`salope`, `salopes`, not `salop*`: salopette).
- `{ "word": "shit*", "allow": ["shiitake", "shitake"] }` keeps the words the entry would otherwise mask: the
  ordinary continuation of a stem (`puttan*` and `puttanesca`), or the form without diacritics of an entry that is an
  ordinary word elsewhere (`pédé` and the Portuguese `pede`). An allow-word keeps the whole words starting with it, a
  word spelled out included, read as the matcher reads them (the case, the leet, the compatibility forms, the separators
  and invisible characters dropped, a repeated letter as long as in the allow-word or longer) but with their diacritics:
  `shiitake` keeps `shiitakes`, `Shiitakepilze`, `shiiitake` and `s h i i t a k e`; `pede` keeps `PEDE`, not `pédé`;
  `fodder` does not keep `foder`.
- The words are sorted (code point order), one entry per line. An exact entry already matched by a stem of any list
  is left out. The same word in two languages stays in both (`puta` in `es` and `pt`).

## Curation

- **Kept:** the sexual vulgarities, the swearing about excretion, the strong insults, the slurs (ethnic, homophobic,
  ableist), the hate slogans that are no ordinary phrase.
- **R1, ordinary words:** an entry that is an ordinary word in any of the eleven languages, as written or without its
  diacritics, whatever its sense, is left out: `ass` (the German _Ass_, the ace of the poker), `dick` (German, thick),
  `con`, `bite`, `pute` (German, turkey), `dupa` (Indonesian, incense), `troia` (Troy), `porra`, `хохол`, `göt`
  (_got_, _Gott_), `möse` (Italian _mosse_), `spic` (Polish _spić_), `sirit` (Turkish _sırıt_), `cum` (Latin, _cum
  laude_), `verga` (Italian and Portuguese, a rod), `hure` (French, a boar's head), `boceta` (European Portuguese, a
  box), `vadia` (Portuguese, stray). A phrase too: `white power` (a cable, the pieces of the chess). When the vulgar
  sense prevails and a single foreign form collides, the entry stays with an allow-word instead (`göte` and the Italian
  _gote_, `taşak` and the Polish _tasak_, whose forms are listed rather than a stem). The repeated letters count too:
  `bite` would mask `bitte`.
- **R2, neutral terms** of identities, ethnic groups, religions, orientations, body parts and medical or sexual
  vocabulary are left out (`negro`, `gay sex`, `penis`, `çingene`).
- **R3, the vocabulary of crime, drugs and violence**, the words of the news, is left out (`rape`, `heroína`).
- **R4, mild exclamations and mild insults** that are standard vocabulary are left out (`god damn`, `idiota`,
  `mannaggia`, `bego`).
- **R5, names** of porn sites, brands and obscure in-jokes are left out (`goatse`, `viagra`, `zio cantante`).
- **R6, the form:** no digit, emoji or symbol, 3 letters at least (`2g1c`, `🖕`, `s&m`, `xx`, `cu`: the "see you" of
  the chats).
- **R7, borrowings:** a word stays in the list of its language only (`bastardo` and `sexo` leave `en`, `nutten` joins
  `de`).
- **R8, stems:** the rule of the stems above.
- **R9, Russian transliterations:** the distinctive ones are kept (`pizd*`, `khuy`, `mudack`, `zaebis`), not those
  that are ordinary Latin words (`gol`, `byk`, `uboy`, `petuh`). An apostrophe spelling gets its spelling without it.
- **R10, Indonesian:** the variants of the `reviewed-core` profile with a severity of 2 or more, the ones with a
  literal use reviewed one by one, then R1 to R6. Left out: the family of `anjing` (dog) and `tai` (`taik`, `taek`:
  _taik lalat_, a mole), the mild exclamations of severity 2 (`damput`, `jancik`, `mampus`), the standard mild insults
  (`bego`, `dungu`, `bloon`, `bedebah`), `bokep` and `esek-esek` (R2), `bebel` and `peler` (French, to peel), `itil`
  (Turkish), `meki` (Polish _męki_). `pepek`, of the `reviewed-contextual` profile, and `sialan`, a mild "damn", are
  left out too: no exception to the rule. `jamput` and `diamput` stay: the catalog gives them a sexual sense, which
  `damput` does not have.
- No word of the texts of the app: the spec runs every translation, in every language and every scope, through the
  lists.

## Accepted false negatives

The filter is a courtesy to the readers, not a guarantee. It misses, on purpose:

- the words split by a space or a separator (`fu ck`): only 3 single letters or more in a row are read as a word;
- the homoglyphs of another script (a Cyrillic `с` in `fuсk`);
- the diacritics added to a word (`fúck`, `shít`): a text may drop the diacritics of an entry, not add one;
- the French and Italian elisions written without their apostrophe (`lenculé`): `l'enculé` is matched;
- a `!` written for a letter before a capital (`F!CK`): it reads as the end of a sentence (`whatever!Shit`);
- the new slang and the spellings the lists do not have.
