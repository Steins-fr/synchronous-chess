---
applyTo: 'application/frontend/game-app/**'
---
# Project Context

This is an Angular TypeScript project with the following characteristics:

## Technology Stack

- Angular 22
- TypeScript
- RxJS
- Angular Material
- Tailwind CSS v4

## Code Conventions

- Zoneless, so use `signal` for all reactive variables used in templates
- Type `signal` / `computed` generics as readonly: `ReadonlyArray<Readonly<T>>` for arrays, `ReadonlyMap<K, Readonly<V>>` for maps (`Readonly<>` is omitted for primitives, e.g. `ReadonlyArray<string>`)
- Inject dependencies using `inject()` function
- Use `takeUntilDestroyed()` for subscription cleanup
- Input/Output uses `input()`, `model()` and `output()` signal function with `readonly` modifier
- Use `viewChild()`, `contentChild()`, `viewChildren()`, `contentChildren()` signal functions
- The template of a component lives in its own `.html` file (`templateUrl`), never inline in the `.ts`
- Follow Angular style guide naming conventions
- Use protected/private access modifiers appropriately
- Strict typing everywhere
- Never use a deprecated API (signature, option, function), in the code as in the specs: use the
  replacement its `@deprecated` note gives. `npm run lint` reports them in the code
  (`sonarjs/deprecation`) but not in the specs, which get the test rules only: check those yourself
- The app is in development, not in production: do not add backward compatibility or rollout
  handling (protocol versioning, support for clients on an older bundle, data migration). Breaking
  the peer-to-peer message format is fine, all the peers run the same build

## Styling

- Prefer Tailwind utilities in the templates to component stylesheets. Keep a stylesheet for what
  utilities cannot express simply (e.g. styles of Material or CDK internals)
- Never hard-code a color: use the `--app-*` variables of `src/styles.scss`, exposed as Tailwind colors
  in `src/tailwind.css` (`bg-app-surface`, `text-app-accent-text`...), or the `--mat-sys-*` variables of
  Material. A new color gets a variable, a `light-dark()` pair when the dark theme needs another one (or
  a system variable of Material), then its `--color-app-*` entry in `@theme inline`
- Elements that look alike share a `@utility` of `src/tailwind.css` (e.g. `rule-card`, `toc-chip`),
  rather than repeating the same list of classes
- Write the markup plainly: no `*:` child variants nor `[&_...]` arbitrary variants to style children
  from their parent, and no `@for` over a literal list only to avoid repeating elements
- Material's typography sits in the `base` layer of Tailwind (`styles.scss`): out of any layer,
  `.mat-typography h3` would win over the utilities of the elements, whatever their specificity. It
  follows the Material 3 scale, where `h1` to `h6` are display and headline sizes: a heading without a
  size of its own takes a class of the scale (`mat-title-large`, `mat-title-medium`...)
- Material 3 theme (`mat.theme()` in `styles.scss`, palettes generated from the blue of the board in
  `_theme-colors.scss`): the components read the `--mat-sys-*` variables, so every component is themed
  without any setup. The `color` input of the components has no effect in Material 3: customize a
  component through its `mat.<component>-overrides()` mixin
- The theme follows the system, or the user's pick. `ThemeService`, and the script of `index.html`
  before the app starts, always set the theme shown in `data-theme` on the html element, which sets
  `color-scheme`: each color of Material and of the app is a `light-dark()` pair, resolved by it. Check
  a visual change in both themes

## Forms

- Every form uses Signal Forms (`@angular/forms/signals`): the model is a `signal`, and its field tree
  comes from `form(model, schema, { name })`. No `FormsModule` / `ngModel`, nor `ReactiveFormsModule` /
  `FormControl`
- The rules of a field (disabled, required, validators with their message...) go in the schema of
  `form()`, e.g. `required(path, { message: marker('...') })` or `disabled(path, { when: () => this.isSending() })`,
  not in bindings on the control. A message is the key of its translation (see Translations). A required text
  uses `requiredText(path, message)` (`modules/form/rules`): it also rejects a text of spaces only. Send a form through `submit()`, which touches its fields and runs
  the action only when the form is valid
- A page gives a field to a form component of `modules/form` (`<app-text-field [field]="setupForm.roomName"
  [label]="t('...')" />`), never a raw `mat-form-field`. Add the missing component there and reuse it
- A form component binds the field to the Material control itself (`<input matInput [formField]="field()">`):
  Material reads the state of the field from the control Signal Forms gives it, the asterisk of a required
  field and the error state of an invalid touched one included. It holds the outlined appearance and shows
  the message of the first error in a `mat-error`, translated with the values of the error as its params
  (`{maxLength}`)
- Name each form (`{ name: 'room-setup' }`): the names of its inputs derive from it. A spec finds a
  control by its label, `textFieldInput(fixture.nativeElement, 'Player name')` (`@testing/text-field.helper`),
  and types in its input

## Translations

- The app speaks the languages of `Language` (`services/language/enums/language.enum.ts`), English
  being the source: every text shown goes through a key of Transloco, translated in
  `src/i18n/<code>.json`, or in the files of its scope for a text of a game (see Scopes). The only
  exception is the debug panel of WebRTC (`modules/debug`), developer tooling, in English out of the keys
- `LanguageService` picks the language: the user's pick, kept in the local storage, else the first
  language of the browser the app speaks, else English. The menu next to the theme toggle switches it
  live: never reload the page to change it, a reload in a match reconnects the peers. The other tabs of
  the app follow it, as they follow the theme (`storageChanges()` of `helpers/stored-preference.helper.ts`)
- The keys are nested by feature (`rooms.open.title`, `chess.game.result.checkmate`). A key is a leaf or
  a parent, never both
- A template translates through the structural directive at its root (`*transloco="let t; prefix:
  'rooms.open'"`), or the `transloco` pipe for a lone text. A text holding an emphasis is html, bound
  with `[innerHTML]` (sanitized by Angular), with `<strong>` or `<em>` only: a link, a badge or an
  element with attributes stays in the template, the sentence around it split into keys of its own,
  rephrased when the order of the words would differ (a label before the link)
- A service, a helper or the code of a component gives the key of a text with its params
  (`TranslatableText`), never a translated text: translated once, it would not follow a change of the
  language. A key picked by the code is written in a `marker('...')` call
  (`@jsverse/transloco-keys-manager/marker`), for the extraction to find it; the pipe, the directive,
  `translate()` and `translateSignal()` need none with a literal key. A message of a form is such a key
- No translated text crosses the network: the API answers with codes (`RoomApiErrorMessage`), and each
  peer builds its texts from the codes of the chain. Keep it that way: every player sees the app in its
  own language
- The specs run in English (`src/test-providers.ts`, every language and every scope loaded for the specs
  switching to a language) and find the elements by their English text; a key missing from the
  translation throws.
  The extraction reads the specs too: never give `translate()` or `marker()` a literal key that does
  not exist in a spec, it would add it to the files. A spec needing a text of its own sets it with
  `TranslocoService.setTranslationKey()`

### Scopes

- The texts of a game are a Transloco scope, in files of their own (`src/i18n/<scope>/<code>.json`),
  loaded by the pages showing the game only: `chess` (the game, its presentation and its rules) and
  `chat`. The rest is global, `home` included: it presents every game
- The route of a page provides the scopes of the games it holds (`provideTranslocoScope('chess',
  'chat')`: the chess page holds the chat), written as literals: the keys manager finds the scopes that
  way. Its `translationScopesGuard` loads them before the page shows, as the app loads its global
  texts before it starts: the first render has every text, the views and queries inside a `*transloco`
  included. A guard, not a resolver: the router runs the guards of a route together, so the
  translations load while the APIs are checked. Failing, it cancels the navigation: the page would show
  without its texts. `app.routes.spec.ts` checks the scopes of each route against `TranslationScope`
- A navigation waiting for the APIs keeps their overlay until its page shows (`ApiHealthOverlayComponent`):
  the previous page never shows again while the translations and the code of the next one load. The
  overlay shows once the wait lasts 0.4 second (`LOADER_DELAY` of `helpers/signal.helper.ts`, through
  `heldFor()`): a quick one keeps the previous page
- A language picked in the menu loads with the scopes of every game (`LanguageService.use()`): every
  text switches at once, those of a page opened meanwhile included (`language.e2e.ts`). A ring turns
  around the icon of the menu while it loads, once the wait lasts `LOADER_DELAY` too. Failing, the app
  keeps its language, even when Transloco showed the new one by itself (it shows the language of a
  load succeeding after a failed one)
- A key of a scope starts with it (`chess.game.seat.free`): the extraction puts it in the files of the
  scope. A text shown out of the pages of its game (a notification) is global
- In the code, `marker()` gets the key of a scope without its scope, the scope as a literal third
  argument, and `scopedKey()` prefixes it for the app: `scopedKey(TranslationScope.CHESS,
  marker('game.turn.sync', undefined, 'chess'))`. The keys manager reads the scope of a key of the code
  from that argument only: a `marker('chess.game.turn.sync')` would land in the global files
- Adding a scope: its value in `TranslationScope`, its provider and the guard on the routes of its
  pages, its loaders in `translation.loader.ts`, its translations in `src/test-providers.ts`; the
  extraction creates its files

### Adding or changing a text

- Adding: write the key in the code, then run `npm run i18n:extract`. It adds the key to the file of
  every language (of its scope), valued `Missing value for '<key>'`: write its value in the eleven files, in the same
  commit. `translations.spec.ts` fails until then
- Changing the meaning of a text: rename its key. The extraction drops the former translations and the
  spec requires the new ones. Fixing its wording only: update the ten translations in the same commit
- Removing: remove the key from the code, then run `npm run i18n:extract`, which removes it from every
  file
- Never edit the keys of a file by hand nor reformat it: the CI runs the extraction and fails when it
  changes anything, a new file included
- Adding a language: its code in `Language`, its name in itself in `LANGUAGE_NAMES`, its loaders in
  `translation.loader.ts` and its translations in `src/test-providers.ts` (the global one and one per
  scope), its code in the `--langs` of `i18n:extract`, then its files, every key translated, and its
  column in the glossary below

### Rules of translation

Claude writes the translations of every new or changed key, into every language:

- The messages are ICU (messageformat). A param is `{name}`, never Transloco's `{{name}}`; a case made
  of a lone param (`other {{chain}}`) reads as one, so write it otherwise. A count is a plural with the
  categories of the language, never `=1`: `{count, plural, one {# room} other {# rooms}}`. Russian and
  Polish give `one`, `few`, `many` and `other`, Indonesian `other` only, the others `one` and `other` at
  least (in French, 0 is `one`). The spec rejects a category the language does not have
- An apostrophe right before a brace quotes it in ICU (`l'{name}` shows `{name}`): double it
  (`l''{name}`), or reword
- Keep the params and the html tags of the English value: `translations.spec.ts` checks both
- Follow the typography of the language: the quotes (English, Portuguese, Turkish and Indonesian
  “…”, French « … », Spanish, Russian and Italian «…», German „…“, Polish „…”) and, in French, a space
  before `:`, `;`, `!` and `?`
- Address the user as the apps of the language do: English _you_, French _vous_, Spanish _tú_,
  Portuguese of Brazil _você_, Portuguese of Portugal the third person (_introduza o seu nome_),
  German _du_, Russian _вы_, Turkish _siz_, Indonesian _Anda_, Polish and Italian the second person
  singular
- Translate `pt-PT` in the European norm, on its own, never as an adaptation of `pt-BR`: _ecrã_ /
  _tela_, _utilizador_ / _usuário_, _registo_ / _registro_, _espetador_ / _espectador_, _a aguardar_ /
  _aguardando_
- Keep a label or a button close to the length of the English one: the toolbar, the buttons of the game
  and the cards of the rooms hold on a phone
- Use the terms of the glossary, the same across the texts and the sessions. A term missing from it is
  added to it with the text using it

### Glossary

| English | fr | es | pt-BR | pt-PT | de | ru | tr | id | pl | it |
|---|---|---|---|---|---|---|---|---|---|---|
| check | échec | jaque | xeque | xeque | Schach | шах | şah | skak | szach | scacco |
| checkmate | échec et mat | jaque mate | xeque-mate | xeque-mate | Schachmatt | мат | şah mat | skakmat | szach-mat | scacco matto |
| stalemate | pat | rey ahogado | afogamento | afogamento | Patt | пат | pat | remis pat | pat | stallo |
| draw | nul | tablas | empate | empate | Remis | ничья | berabere | remis | remis | patta |
| castling | roque | enroque | roque | roque | Rochade | рокировка | rok | rokade | roszada | arrocco |
| en passant | prise en passant | captura al paso | en passant | captura en passant | en passant | взятие на проходе | geçerken alma | en passant | bicie w przelocie | presa en passant |
| promotion | promotion | coronación | promoção | promoção | Umwandlung | превращение | terfi | promosi | promocja | promozione |
| capture | capture | captura | captura | captura | Schlagen | взятие | alma | makan | bicie | cattura |
| pinned piece | pièce clouée | pieza clavada | peça cravada | peça cravada | gefesselte Figur | связанная фигура | açmazdaki taş | buah terpaku | związana bierka | pezzo inchiodato |
| move | coup | jugada | lance | jogada | Zug | ход | hamle | langkah | ruch | mossa |
| turn | tour | turno | turno | turno | Runde | ход | tur | giliran | tura | turno |
| synchronous turn | tour synchrone | turno sincronizado | turno sincronizado | turno sincronizado | synchrone Runde | синхронный ход | eşzamanlı tur | giliran serentak | tura synchroniczna | turno sincrono |
| intermediate turn | tour intermédiaire | turno intermedio | turno intermediário | turno intermédio | Zwischenrunde | промежуточный ход | ara tur | giliran antara | tura pośrednia | turno intermedio |
| pass (a turn) | passer | pasar | passar | passar | passen | пропустить | pas geç | lewati | pasuj | passa |
| piece | pièce | pieza | peça | peça | Figur | фигура | taş | buah | bierka | pezzo |
| pawn | pion | peón | peão | peão | Bauer | пешка | piyon | pion | pionek | pedone |
| king | roi | rey | rei | rei | König | король | şah | raja | król | re |
| rook | tour | torre | torre | torre | Turm | ладья | kale | benteng | wieża | torre |
| bishop | fou | alfil | bispo | bispo | Läufer | слон | fil | gajah | goniec | alfiere |
| knight | cavalier | caballo | cavalo | cavalo | Springer | конь | at | kuda | skoczek | cavallo |
| square | case | casilla | casa | casa | Feld | поле | kare | petak | pole | casa |
| rank | rangée | fila | fileira | fila | Reihe | горизонталь | yatay sıra | baris | rząd | traversa |
| White / Black | les blancs / les noirs | las blancas / las negras | as brancas / as pretas | as brancas / as pretas | Weiß / Schwarz | белые / чёрные | Beyaz / Siyah | Putih / Hitam | białe / czarne | il Bianco / il Nero |
| win | victoire | victoria | vitória | vitória | Sieg | победа | galibiyet | menang | wygrana | vittoria |
| room | salle | sala | sala | sala | Raum | комната | oda | ruang | pokój | stanza |
| open rooms | salles ouvertes | salas abiertas | salas abertas | salas abertas | offene Räume | открытые комнаты | açık odalar | ruang terbuka | otwarte pokoje | stanze aperte |
| private / public room | salle privée / publique | sala privada / pública | sala privada / pública | sala privada / pública | privater / öffentlicher Raum | приватная / публичная комната | özel / herkese açık oda | ruang privat / publik | pokój prywatny / publiczny | stanza privata / pubblica |
| host | hôte | anfitrión | anfitrião | anfitrião | Gastgeber | хост | ev sahibi | tuan rumah | gospodarz | host |
| player | joueur | jugador | jogador | jogador | Spieler | игрок | oyuncu | pemain | gracz | giocatore |
| participant | participant | participante | participante | participante | Teilnehmer | участник | katılımcı | peserta | uczestnik | partecipante |
| spectator | spectateur | espectador | espectador | espetador | Zuschauer | зритель | izleyici | penonton | widz | spettatore |
| seat | place | puesto | lugar | lugar | Platz | место | yer | kursi | miejsce | posto |
| password | mot de passe | contraseña | senha | palavra-passe | Passwort | пароль | şifre | kata sandi | hasło | password |
| chat | tchat | chat | bate-papo | chat | Chat | чат | sohbet | obrolan | czat | chat |
| server | serveur | servidor | servidor | servidor | Server | сервер | sunucu | server | serwer | server |
| cheating | triche | trampa | trapaça | batota | Betrug | жульничество | hile | curang | oszustwo | imbroglio |

## Testing

- Keep 100% line and branch coverage: every commit and push must leave `npm run test:ci` fully
  covered (report in `coverage/game-app/lcov.info`), so new or changed code ships with its specs
- Enforced by `coverageThresholds` in `angular.json`: `npm run test:ci` fails below 100%
- SonarCloud reports coverage on the PR's new code; it must stay at 100% there too

## Project Structure

- Import shortcut `@app/*`for `src/app/*`
- Import shortcut `@testing/*` for `src/testing/*`
- Import shortcut `@protocol/*` for `../../shared/room-socket-protocol/*`: the WebSocket message types
  and the paths of the HTTP API, shared with the API, never duplicated in the app

## Common Patterns

- Use enum constants for type safety
