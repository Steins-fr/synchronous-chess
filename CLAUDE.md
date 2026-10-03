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
- Code lives under `src/app/{modules,services,pages,helpers,types}`.
- Tailwind v4 is wired through PostCSS (`src/tailwind.css`); global styles in `src/styles.scss`.

## Browser testing

Claude drives the app in a headless Chromium through the Playwright MCP server declared in
`.mcp.json` (`@playwright/mcp`, `--browser chromium --isolated --headless`; without `--browser`
it looks for a branded Google Chrome). The `/chrome` integration is not used: the repo is
developed in WSL, which it does not support.

- One-time setup in WSL: `npx playwright install-deps chromium` for the system libraries (needs
  sudo), then `npx @playwright/mcp@latest install-browser chrome-for-testing` for the browser build
  the MCP expects (a plain `npx playwright install` fetches an older one). Restart the Claude Code
  session so the `mcp__playwright__*` tools load. Rerun the second command if the MCP reports a
  missing browser after an update.
- The MCP writes its snapshots and console logs to `.playwright-mcp/` (git-ignored).
- Save every screenshot to `.playwright-mcp/screenshots/`, named with the local ISO date and time as a
  prefix, with `-` instead of `:` (not allowed in Windows file names):
  `filename: ".playwright-mcp/screenshots/2026-10-03T08-21-56_chat-alice.png"`. Get the prefix
  from `date +%Y-%m-%dT%H-%M-%S` right before taking the screenshot.
- Before starting a new browser test, delete the screenshots of the previous one:
  `rm -f .playwright-mcp/screenshots/*`.

### Cleanup after every browser test

When a browser test is done, always shut everything down before reporting back:

1. Close the browser with `mcp__playwright__browser_close` (once per Playwright server used).
2. Stop the Angular dev server: stop its background task, then check that port 4200 is free
   (`lsof -i :4200` prints nothing) and kill any leftover `ng serve` process.
- Start `npm run serve:dev` in the background, then browse `http://localhost:4200`.
- `--isolated` gives each browser context its own storage, so two tabs can play the two peers of a
  match. If their state collides, add a second server (e.g. `playwright2`) for an independent
  browser.

## CI

`.github/workflows/game-app-pull-request.yml` runs lint, then tests with coverage and a SonarCloud
scan, on PRs touching `application/frontend/game-app/**`. `game-app-main.yml` runs the tests and
the SonarCloud scan on `main` (pushes touching the app, or manually) for the README badges.
Terraform workflows cover `infrastructure`. Keep `npm run lint` and `npm run test:ci` green before pushing.
