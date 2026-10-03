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
- `application/backend/websocket-api` — AWS Lambda WebSocket API (TypeScript, esbuild, DynamoDB)
- `application/shared/room-socket-protocol` — the WebSocket message types (requests, responses,
  notifications, error messages), imported by both packages as `@protocol/*`. Plain TypeScript with
  no dependency nor package.json: each package compiles it through its own tsconfig alias
- `application/shared/sonar-eslint-rules` — the ESLint rules of the SonarCloud quality profile
  (`sonar-way.json`), used by the ESLint configs of both packages, and the script generating them
- `infrastructure` — Terraform (AWS), applied by GitHub Actions
- `documentation` — resources and diagrams

## Commands

Frontend, from `application/frontend/game-app`:

```bash
npm run serve:local  # dev server, against the local API (see below)
npm run serve:dev    # dev server, against the development API on AWS
npm run build        # production build (build:staging / build:dev for other configs)
npm test             # Vitest in watch mode
npm run test:ci      # single run with coverage (what CI runs)
npm run lint         # ESLint (Angular, template, RxJS and stylistic rules)
```

Run some specs: `npx ng test --watch=false --include='src/app/path/to/**/*.spec.ts'`. A plain
`npx vitest run <file>` only works for the specs without a component: it does not compile the
templates, nor type-check the specs as `ng test` does.

Backend, from `application/backend/websocket-api`:

```bash
npm run serve:local  # the API on ws://127.0.0.1:3001, without AWS (local/server.ts, DynamoDB in memory)
npm run build        # esbuild bundle
npm run lint         # ESLint, then the shared protocol (lint:protocol)
npm run typecheck    # tsc, the API then the shared protocol (esbuild does not check types)
npm test             # Vitest in watch mode
npm run test:ci      # single run with coverage, 100% required (vitest.config.ts)
```

The API specs sit next to their file and mock DynamoDB and API Gateway with `aws-sdk-client-mock`:
`mockAws()` of `testing/api-mocks.ts` (alias `@testing/*`) resets both before each test, with the room
fixtures and a reader of the packets posted to the connections. Except `local/local-api.spec.ts`: it starts
the local API on a free port, with dynalite and real websocket clients, out of the coverage threshold.

## Frontend specifics

- Tests use **Vitest** with jsdom (`vitest.config.ts`, `test-setup.ts`), not Karma/Jasmine.
  Shared test providers are in `src/test-providers.ts`, helpers under `src/testing`.
- Path aliases: `@app/*`, `@environments/*`, `@testing/*`, `@protocol/*` (the shared WebSocket protocol).
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

### Testing a chess game

- Each participant, the host included, takes a seat with the `Jouer les blancs` / `Jouer les noirs`
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
