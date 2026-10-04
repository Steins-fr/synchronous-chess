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
  `form()`, e.g. `required(path, { message: '...' })` or `disabled(path, { when: () => this.isSending() })`,
  not in bindings on the control. A required text uses `requiredText(path, message)` (`modules/form/rules`):
  it also rejects a text of spaces only. Send a form through `submit()`, which touches its fields and runs
  the action only when the form is valid
- A page gives a field to a form component of `modules/form` (`<app-text-field [field]="setupForm.roomName"
  label="..." />`), never a raw `mat-form-field`. Add the missing component there and reuse it
- A form component binds the field to the Material control itself (`<input matInput [formField]="field()">`):
  Material reads the state of the field from the control Signal Forms gives it, the asterisk of a required
  field and the error state of an invalid touched one included. It holds the outlined appearance and shows
  the message of the first error in a `mat-error`
- Name each form (`{ name: 'room-setup' }`): the names of its inputs derive from it. A spec finds a
  control by its label (`app-text-field[label="Nom du joueur"] input`) and types in its input

## Testing

- Keep 100% line and branch coverage: every commit and push must leave `npm run test:ci` fully
  covered (report in `coverage/game-app/lcov.info`), so new or changed code ships with its specs
- Enforced by `coverageThresholds` in `angular.json`: `npm run test:ci` fails below 100%
- SonarCloud reports coverage on the PR's new code; it must stay at 100% there too

## Project Structure

- Import shortcut `@app/*`for `src/app/*`
- Import shortcut `@testing/*` for `src/testing/*`
- Import shortcut `@protocol/*` for `../../shared/room-socket-protocol/*`: the WebSocket message types
  shared with the API, never duplicated in the app

## Common Patterns

- Use enum constants for type safety
