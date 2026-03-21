---
applyTo: 'application/frontend/game-app/**'
---
# Project Context

This is an Angular TypeScript project with the following characteristics:

## Technology Stack

- Angular 20
- TypeScript
- RxJS
- Angular Material
- Tailwind CSS v4

## Code Conventions

- Zoneless, so use `signal` for all reactive variables used in templates
- Inject dependencies using `inject()` function
- Use `takeUntilDestroyed()` for subscription cleanup
- Input/Output uses `input()`, `model()` and `output()` signal function with `readonly` modifier
- Use `viewChild()`, `contentChild()`, `viewChildren()`, `contentChildren()` signal functions
- Follow Angular style guide naming conventions
- Use protected/private access modifiers appropriately
- Strict typing everywhere

## Project Structure

- Import shortcut `@app/*`for `src/app/*`
- Import shortcut `@testing/*` for `src/testing/*`

## Common Patterns

- Use enum constants for type safety
