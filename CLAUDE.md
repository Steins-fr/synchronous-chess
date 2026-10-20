# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Shared AI configuration

The repository's AI instructions live in `.github/instructions/` so that GitHub Copilot and
Claude Code share a single source of truth. Edit those files, not this one, when a rule applies
to both tools. They are imported below.

@.github/instructions/git-config.instructions.md
@.github/instructions/game-app.instructions.md
@.github/instructions/room-socket-protocol.instructions.md

Note: each imported file has a Copilot `applyTo` glob in its front matter. Claude Code has no
equivalent, so treat `game-app.instructions.md` as applying only to
`application/frontend/game-app/**`, and `room-socket-protocol.instructions.md` only to
`application/shared/room-socket-protocol/**`.

## Repository layout

Mono-repo, no root package.json — each package is installed and run from its own directory.

- `application/frontend/game-app` — Angular 21 app (the main project)
- `application/backend/websocket-api` — AWS Lambda API: a WebSocket API for the connectivity of the rooms, an HTTP API
  for the rest, the list of the rooms (TypeScript, esbuild, PostgreSQL with Drizzle: Aurora Serverless v2 through its
  Data API)
- `application/shared/room-socket-protocol` — the WebSocket message types (requests, responses,
  notifications, error messages) and the paths of the HTTP API, imported by both packages as `@protocol/*`. Plain TypeScript with
  no dependency nor package.json: each package compiles it through its own tsconfig alias
- `application/shared/sonar-eslint-rules` — the ESLint rules of the SonarCloud quality profile
  (`sonar-way.json`), used by the ESLint configs of both packages, and the script generating them
- `infrastructure` — Terraform (AWS): the stages (staging, production), applied by GitHub Actions, and
  `infrastructure/bootstrap`, applied once locally (the GitHub trust, the deploy roles, the boundaries of the lambdas, the
  login of staging)
- `documentation` — resources and diagrams

## Commands

Frontend, from `application/frontend/game-app`:

```bash
npm run serve:local  # dev server, against the local API (see below), as `ng serve`
npm run build        # production build (build:staging for staging)
npm test             # Vitest in watch mode
npm run test:ci      # single run with coverage (what CI runs)
npm run lint         # ESLint (Angular, template, RxJS and stylistic rules)
npm run e2e          # Playwright end-to-end tests of the rooms (see Browser testing), local only
npm run e2e:fast     # the e2e scenarios but the slow ones (1.5 minute), e2e:slow for these only (4 minutes)
```

Run some specs: `npx ng test --watch=false --include='src/app/path/to/**/*.spec.ts'`. A plain
`npx vitest run <file>` only works for the specs without a component: it does not compile the
templates, nor type-check the specs as `ng test` does.

Backend, from `application/backend/websocket-api`:

```bash
npm run serve:local  # the API on ws:// and http://127.0.0.1:3001, without AWS (local/server.ts, PGlite in memory)
npm run build        # esbuild bundle
npm run lint         # ESLint, then the shared protocol (lint:protocol)
npm run typecheck    # tsc, the API then the shared protocol (esbuild does not check types)
npm test             # Vitest in watch mode
npm run test:ci      # single run with coverage, 100% required (vitest.config.ts)
npm run db:generate  # the migration of a change of shared/database/schema.ts, to commit with it (drizzle/)
npm run db:check     # fails on a schema without its migration (CI)
npm run smoke:data-api -- <stage>  # the statements of the repositories on the Aurora cluster of a stage (AWS_PROFILE)
```

The API specs sit next to their file and run on PGlite, PostgreSQL in memory with the migrations of `drizzle/`:
`useTestDatabase()` of `testing/database.ts` gives each spec file its database, emptied before each test.
`mockAws()` of `testing/api-mocks.ts` (alias `@testing/*`) adds it to the mock of API Gateway
(`aws-sdk-client-mock`), with the room fixtures, `storeRoom()` / `readRoom()` and a reader of the packets posted
to the connections. The specs assert the rows, never the SQL. `aws-sdk-client-mock` mocks the Data API client in
`shared/database` only. `local/local-api.spec.ts` starts the local API on a free port, with real websocket
clients and HTTP requests, out of the coverage threshold.

## Frontend specifics

- Tests use **Vitest** with jsdom (`vitest.config.ts`, `test-setup.ts`), not Karma/Jasmine.
  Shared test providers are in `src/test-providers.ts`, helpers under `src/testing`.
- Path aliases: `@app/*`, `@environments/*`, `@testing/*`, `@protocol/*` (the shared protocol of the API).
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
- Start the local API (`npm run serve:local` in `application/backend/websocket-api`) and the game app
  (`npm run serve:local` in `application/frontend/game-app`) in the background, then browse
  `http://localhost:4200`.
- `--isolated` gives each browser context its own storage, so two tabs can play the two peers of a
  match. If their state collides, add a second server (e.g. `playwright2`) for an independent
  browser.
- The MCP writes its snapshots and console logs to `.playwright-mcp/` (git-ignored).
- Save every screenshot to `.playwright-mcp/screenshots/`, named with the local ISO date and time as a
  prefix, with `-` instead of `:` (not allowed in Windows file names):
  `filename: ".playwright-mcp/screenshots/2026-10-03T08-21-56_chat-alice.png"`. Get the prefix
  from `date +%Y-%m-%dT%H-%M-%S` right before taking the screenshot.
- Before starting a new browser test, delete the screenshots of the previous one:
  `rm -f <repo root>/.playwright-mcp/screenshots/*.png`, with the absolute path of the repo and no
  `cd` in the command, or Claude Code's safety check blocks the removal.

### End-to-end tests

`npm run e2e` (game app) runs the Playwright suite of `e2e/` (`*.e2e.ts`, config in `playwright.config.ts`):
the scenarios of the rooms, with one browser context per player connected through WebRTC. It starts the local API
and the game app, or reuses the ones running on ports 3001 and 4200, and stops what it started. Local only, not
run by the CI.

- One-time setup: `npx playwright install chromium` in the game app (the browser of `@playwright/test`, apart
  from the one of the MCP).
- `e2e/test-room.ts` gives each test a room of its own (`room` fixture), `e2e/room-participant.ts` drives a player:
  join, reload, messages, the participants it sees, and `cutConnections()` to close its WebRTC connections as a
  network failure would.
- A failed test keeps its trace: `npx playwright show-trace test-results/<test>/trace.zip`, without the snapshots of
  the DOM in `bots.e2e.ts` (they run in the page with a user gesture, which activates it). The servers' logs are not
  shown: start the servers apart to read them.
- Run one scenario with `npx playwright test -g "<part of its name>"`.
- Two suites: `npm run e2e:fast` runs the quick scenarios, `npm run e2e:slow` the ones tagged `SLOW` (`@slow`,
  `e2e/test-room.ts`), which wait for a delay of the room: the joins refused for 20 seconds, a negotiation timing
  out after 15 seconds, the room handed over. Tag a new scenario lasting 20 seconds or more. `npm run e2e` runs both.
- Starting the servers takes Playwright several minutes: to run the suites more than once, start the local API and
  the game app apart (`npm run serve:local` in each), then stop them.

### Testing a chess game

- The chess page is `/synchronous-chess`, the chat page `/simple-chat`: the home page only links to them.
- Each participant, the host included, takes a seat with the `Play white` / `Play black`
  buttons: two tabs are enough. See `documentation/chess-game-session.md`.
- The pieces only move by drag and drop (CDK drag). Drive the mouse from
  `mcp__playwright__browser_run_code_unsafe`: `mouse.down()` on the origin cell, a first small
  `mouse.move` to start the drag, then a `mouse.move` with `steps` to the destination and
  `mouse.up()`. The cells are `#board-grid mat-grid-tile`, rank 8 first, not flipped for black.
- `page.context().pages()` reaches every tab from one script, to compare the boards after a turn.
- The MCP only records the console of the selected tab: select each tab and call
  `mcp__playwright__browser_console_messages` to check it.

### Cleanup after every browser test

When a browser test is done, always shut everything down before reporting back:

1. Close the browser with `mcp__playwright__browser_close` (once per Playwright server used).
2. Stop the Angular dev server and the local API: stop their background tasks, then check that ports
   4200 and 3001 are free (`lsof -i :4200 -i :3001` prints nothing) and kill any leftover `ng serve`
   or `tsx` process by its port (`kill $(lsof -ti :3001)`): `pkill -f <pattern>` also matches the shell
   running it, and kills it.

## SonarQube

### ESLint rules of the quality profile

`npm run lint` raises the issues SonarCloud would report: both ESLint configs apply the rules of the
TypeScript quality profile of the project ("My Sonar way"), listed in
`application/shared/sonar-eslint-rules/sonar-way.json`. The profile is the reference, ESLint mirrors it.

- `npm run sonar-rules` (game app) regenerates the file from the profile, through the SonarQube CLI and
  `eslint-plugin-sonarjs` (which maps each Sonar rule to its ESLint rule). Rerun it when the profile or the
  plugin changes, and review the diff.
- The specs get the rules SonarCloud applies to tests only, like its analysis.
- Not mirrored: the security (taint analysis) and architecture rules, run by SonarCloud only. Some rules
  SonarCloud runs with exceptions of its own: the deviations are in `OVERRIDES` of `generate.mjs`.
- A false positive in ESLint is turned off in ESLint, not in the profile.

### SonarQube MCP

`.mcp.json` also declares the SonarQube MCP server (`sonar run mcp --project Steins-fr_synchronous-chess`),
to read the SonarCloud issues, quality gate and coverage of the project.

- Needs the SonarQube CLI (`sonar`, installed under `~/.local/share/sonarqube-cli/bin`) on the `PATH`
  and a container runtime: the CLI starts the `sonarsource/sonarqube-mcp` Docker image.
- In WSL there is no keychain: the CLI authenticates with `SONARQUBE_CLI_TOKEN` and
  `SONARQUBE_CLI_ORG`, exported by `~/.sonar-env` (sourced from `~/.zshrc`). Claude Code must be
  started from a shell that has them.

## CI

`.github/workflows/application-ci.yml` holds the jobs of both packages: lint (and type check for the
API), tests with coverage, then one SonarCloud scan of the game app, the shared protocol and the API,
with the coverage of both. SonarCloud replaces the whole analysis of the project at each scan, so the
scan always covers both packages. `application-pull-request.yml` runs it on PRs touching
`application/**`, `application-main.yml` without the lint on `main` (or manually) for the README
badges. Terraform workflows cover `infrastructure`. Keep `npm run lint` and `npm run test:ci` of both
packages green before pushing.
