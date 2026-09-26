# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Shared AI configuration

The repository's AI instructions live in `.github/instructions/` so that GitHub Copilot and
Claude Code share a single source of truth. Edit those files, not this one, when a rule applies
to both tools. They are imported below.

@.github/instructions/git-config.instructions.md
@.github/instructions/game-app.instructions.md

Note: each imported file has a Copilot `applyTo` glob in its front matter. Claude Code has no
equivalent, so treat `game-app.instructions.md` as applying only to
`application/frontend/game-app/**`.

## Repository layout

Mono-repo, no root package.json — each package is installed and run from its own directory.

- `application/frontend/game-app` — Angular 21 app (the main project)
- `application/backend/websocket-api` — AWS Lambda WebSocket API (TypeScript, esbuild, DynamoDB)
- `infrastructure` — Terraform (AWS), applied by GitHub Actions
- `documentation` — resources and diagrams

## Commands

Frontend, from `application/frontend/game-app`:

```bash
npm run serve:dev    # dev server
npm run build        # production build (build:staging / build:dev for other configs)
npm test             # Vitest in watch mode
npm run test:ci      # single run with coverage (what CI runs)
npm run lint         # ESLint (Angular, template, RxJS and stylistic rules)
```

Run a single spec: `npx vitest run src/app/path/to/file.spec.ts`

Backend, from `application/backend/websocket-api`:

```bash
npm run build        # esbuild bundle
npm run lint         # ESLint
```

## Frontend specifics

- Tests use **Vitest** with jsdom (`vitest.config.ts`, `test-setup.ts`), not Karma/Jasmine.
  Shared test providers are in `src/test-providers.ts`, helpers under `src/testing`.
- Path aliases: `@app/*`, `@environments/*`, `@testing/*`.
- Code lives under `src/app/{modules,services,pages,helpers,types}`; `src/app/deprecated`
  is legacy — don't extend it.
- Tailwind v4 is wired through PostCSS (`src/tailwind.css`); global styles in `src/styles.scss`.

## CI

`.github/workflows/game-app-pull-request.yml` runs lint, then tests with coverage and a SonarCloud
scan, on PRs touching `application/frontend/game-app/**`. Terraform workflows cover
`infrastructure`. Keep `npm run lint` and `npm run test:ci` green before pushing.
