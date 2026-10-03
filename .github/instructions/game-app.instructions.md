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
- Follow Angular style guide naming conventions
- Use protected/private access modifiers appropriately
- Strict typing everywhere
- The app is in development, not in production: do not add backward compatibility or rollout
  handling (protocol versioning, support for clients on an older bundle, data migration). Breaking
  the peer-to-peer message format is fine, all the peers run the same build

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
