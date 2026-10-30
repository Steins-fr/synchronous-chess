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
npm run e2e:fast     # the e2e scenarios but the slow ones (1.5 minute), e2e:slow for these only (6.5 minutes)
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

- The pages of the games never jump: `e2e/page-steadiness.ts` records where elements lie at each frame
  (`watchSteadiness()`), and a scenario of each game checks that none of them moved (`movedElements()`).
- One-time setup: `npx playwright install chromium` in the game app (the browser of `@playwright/test`, apart
  from the one of the MCP).
- `e2e/test-room.ts` gives each test a room of its own (`room` fixture, a chat room; `new TestRoom(browser, path)` for
  the page of another game), listed under its `id` once created (its `name` and the tag the API drew, `room-1#004512`), `e2e/room-participant.ts` drives a player: join, reload, messages, the participants it
  sees, and `cutConnections()` to close its WebRTC connections as a network failure would.
- The page of a room holds its id in its URL (`?room=room-1%23004512`), and its tab the name and the token of its join
  (session storage): `reload()` reloads the page, which joins its room again by itself, without dialog; the URL opened
  in another browser opens the join dialog of the room (`visitUrl()`). `leaveRoom()` clicks the button of the bar leaving
  the room (`#room-leave`): the list shows again, the room removed from the URL and the session. A player leaving a
  match in progress is asked to confirm: `RoomParticipant` accepts the dialog of the browser (`beforeunload`, counted
  by `expectUnloadPrompts()`), the dialog of the app is clicked by the scenario.
- A failed test keeps its trace: `npx playwright show-trace test-results/<test>/trace.zip`, without the snapshots of
  the DOM in `bots.e2e.ts` (they run in the page with a user gesture, which activates it). The servers' logs are not
  shown: start the servers apart to read them.
- A scenario narrowing the window under 1024 pixels calls `narrow()`: the chat of the game closes over it, and the game
  widens for a moment, which would move what a drag aims at or `watchSteadiness()` records.
- Run one scenario with `npx playwright test -g "<part of its name>"`.
- Two suites: `npm run e2e:fast` runs the quick scenarios, `npm run e2e:slow` the ones tagged `SLOW` (`@slow`,
  `e2e/test-room.ts`), which wait for a delay of the room: the joins refused for 20 seconds, a negotiation timing
  out after 15 seconds, the room handed over, the moves of a poker hand timing out after 45 seconds, 30 more for a player away. Tag a new scenario lasting 20 seconds or more. `npm run e2e` runs both.
- Starting the servers takes Playwright several minutes: to run the suites more than once, start the local API and
  the game app apart (`npm run serve:local` in each), then stop them.

### Testing the chat of a game

- The pages of a room scroll under the navigation, in the content of a `mat-sidenav-container` (`RoomLayoutComponent`):
  the bar of the room (`#room-bar`) stays on top, with the button of the chat (`#room-chat-toggle`, the unread messages
  on its badge), the one of the history of a game (`#room-history-toggle`, `History`) and the one leaving the room
  (`#room-leave`, `Leave`). The chat page (`/simple-chat`) shows its chat in the page, without button, once in a room: the chat
  of the next room starts empty.
- With `webrtcDebug` of the environment on (local, so `serve:local` and the e2e, and staging; off in production and
  the specs), a small floating button at the bottom right of the content (`#webrtc-debug-open`, `WebRTC debug`) opens
  the debug panel of WebRTC once in a room, in a bottom sheet: the dialog `WebRTC debug`, the states of the connection
  to each player and negotiator. Sticky while the page scrolls, in a band of its own at its end, it lies beside the
  panel of the room on a wide screen and under the panel over the game. `#webrtc-debug-close`, Escape, a click beside it or the end
  of the room close the sheet.
- The chat (`#room-chat`) and the history of the game (`#room-history`) share the panel of the room, a sidenav
  (`#room-panel`): its button shows each one, the other one given way to. Assert the panel open or closed on
  `#room-panel`, the content it shows on `#room-chat` / `#room-history` (hidden while the other one shows).
- From 1024 pixels wide, the panel opens beside the game: the chat open by default and as the user left it
  (`ChatPreferencesService`, the local storage), the history closed until opened, never remembered; narrower, the panel
  opens over the game, closed when the page shows, and the back gesture closes it. A hidden chat keeps receiving its
  messages, its unread ones on its button.
- The history of a game lists the moves of the game in progress (`#history-current li`, the latest first) and, for the
  poker and the roulette, the past matches or games of the room (`#history-past li`): `openHistory()`,
  `historyLines()` and `pastLines()` of `e2e/room-participant.ts`. `#history-close` closes it.
- A message is a bubble of `#chat-log` (`.chat-bubble`), its author in a hidden text first (`alice: hello`). Enter
  sends it, Shift+Enter starts a new line; the options of the chat (`#chat-options`) hide the arrivals and departures,
  the times, a player's messages, mask the offensive words (`Hide offensive words`, on by default: `f***`), or turn
  Enter into a new line.
- The composer refuses a link or an e-mail address (`No link nor e-mail address in the chat`), and every page drops one
  sent around it, reported as an invalid message.
- The composer sends 3 messages in 10 seconds at most: then `#send` and the Retry of a failed message are disabled,
  and a hint of the field counts down (`Wait 7 seconds before sending another message`). It waits too while 5 of its
  messages are not sent back (`Wait until your messages are sent before sending more`), Retry enabled. Each page hides the messages
  of an author over 8 in 10 seconds of the chain, until its rate falls back, and a notice of the log tells it once
  (`bob sends too many messages: they are hidden for a moment`): a scenario sending more than 3 messages in a row
  waits between them. `transmitAroundComposer()` of `e2e/room-participant.ts` sends a flood as a script in the page
  would, through the debugging utilities of Angular (`ng`, the development build of `serve:local` only).
- The host moderates the chat (the participant ordering the chain): a button beside the chip of each other participant
  of `#player-list` (`Moderate bob`), the host of the room excepted, opens its menu, `Mute for 5 minutes`, `Mute for 30
  minutes`, `Mute until the end of the room` (`Unmute` once muted) and `Remove from the room`, confirmed in the dialog of
  the app (`Confirm`):
  `moderate(name, item)` of `e2e/room-participant.ts`. Every page tells it in a notice of the log (`.chat-notice`),
  worded for each one: `You muted bob for 5 minutes` for the host, `alice muted you for 5 minutes` for bob, `alice
  muted bob for 5 minutes` for the others, `alice removed bob from the room`. The composer of a muted participant
  waits, `#send` disabled, its hint telling until when (`You are muted until 12:38 PM`), and every page hides its
  messages. A participant removed is told `The host removed you from the room.` and sees the list again, its links
  closed after 5 seconds; its joins are refused, under its name or from its browser under another one (`You were
  removed from this room: you cannot join it again.`).
- The API knows a browser by an id of its local storage (`synchronous-chess:browser-id`): the tabs of one Playwright
  MCP server share their local storage, so one browser id. Play a removed participant in a second server
  (`playwright2`), else the removal refuses every tab.

### Testing a chess game

- The chess page is `/synchronous-chess`, the chat page `/simple-chat`, the Seventeen Poker page `/seventeen-poker`,
  the Russian roulette page `/russian-roulette`: the home page only links to them.
- Each participant, the host included, takes a seat with the single button below the board (`#seat-bottom`):
  `Play white`, or `Play black` once white is taken. Two tabs are enough. See `documentation/chess-game-session.md`.
- The pieces only move by drag and drop (CDK drag). Drive the mouse from
  `mcp__playwright__browser_run_code_unsafe`: `mouse.down()` on the origin cell, a first small
  `mouse.move` to start the drag, then a `mouse.move` with `steps` to the destination and
  `mouse.up()`. The cells are `#board-grid mat-grid-tile`, rank 8 and the A column first, flipped for the
  board seen from black (the black player, a spectator who may take black): rank 1 and the H column first.
- `page.context().pages()` reaches every tab from one script, to compare the boards after a turn.
- `e2e/synchronous-chess.e2e.ts` drives a game the same way, in a window holding the whole board (`drag()`).
- The MCP only records the console of the selected tab: select each tab and call
  `mcp__playwright__browser_console_messages` to check it.
- The history of the room lists the moves of each turn (`Turn 1 · White: F2 → F3`), the latest turn first, white
  first in a turn.
- Before the first move, the seat of a player away (its tab closed) shows `Free the seat` to the other player and to
  the host, a spectator included. Once the game started, a status line below the board tells the wait to every page
  (`#game-status`, `Waiting for bob to come back…`), and the player who played sees a clock of 30 seconds beside it
  (`#away-clock`, `29 s`): once over, it wins the game (`Black was away when the time ran out: White wins`, the first
  line of the history `Black was away when the time ran out`). The scenario of the clock is `SLOW`.

### Testing a poker game

- Each participant takes a seat with `Sit here`, on the free seat at the bottom of the table only (`#seat-bottom`
  of `app-poker-table`, `#seat-top` the other one), then the dealer clicks `Deal`: the second seat deals the first
  hand, then the players deal by turns. The table shows the local player at its bottom, a spectator the free seat it
  may take, else the first seat. See `documentation/seventeen-poker-session.md`.
- The actions are buttons named by their text (`Check`, `Bet 6`, `Call 6`, `Raise to 13`, `Fold`, `Bet more`,
  `Min`, `Max`, `Keep my hand`, `Exchange 2 cards`, `Play again` once the match is over, `Free the seat` of a player away); the cards of the player are buttons during the exchange,
  `aria-pressed` once selected. A card is an image named by its card (`Ace of spades`, `Face-down card`), and
  the `status` role (`<output>`) tells what the table waits for.
- The bets of the round lie on the cloth (`#bet-top` / `#bet-bottom`, `Bet 6`), and the outcome of a hand over
  shows in `#hand-outcome` until the next deal. The chips are decorative (`aria-hidden`): read the amounts in
  the texts. The chips moved fly over the table (`.chip-flight`) until their animation ends.
- A card thrown away keeps its element while it leaves the hand (`li.card-discarded`): read the cards
  without it, as `e2e/seventeen-poker.e2e.ts` does.
- The hands played (`Hand 1: …`) and the matches played (`Match 1: …`) are in the history of the room, out of the
  table.
- While the seats are open, the seat of a player away shows `Free the seat` to the other player and to the host, a
  spectator included: the host frees the seat of a player alone at the table.

### Testing a Russian roulette game

- Each participant takes a seat with `Sit here`, on the free seat at the bottom of the table only (`#seat-bottom` of
  `app-roulette-table`, as for the poker), then each player picks the chambers of its bullets, buttons named
  `Chamber 1` to `Chamber 24` (`aria-pressed` once picked), and clicks `Load (3/3)`. The pages load and spin the cylinder by themselves, then the player drawn plays first. See
  `documentation/russian-roulette-session.md`.
- The moves are buttons named by their text (`Shoot`, `Pass (1)`, `Play again`, `Free the seat`), the `status` role
  (`<output>`) tells what the table waits for, `#last-move` the latest move, `#bank` and `#table-chips` the chips.
- The chambers of the cylinder are images named by their state once fired (`Chamber 3: empty`, `Chamber 3: a bullet`,
  `Chamber 3: two bullets`), `Chamber 3` while hidden. The result shows in `.badge`, provisional until the cylinder is
  checked (`The cylinder was fair.`).
- A shot plays about 5 seconds: the revolver holds 3.5 seconds in front of the player, then fires. Until then, the table
  shows the state before the shot (`#last-move`, the chambers, the stacks), and no button of the next move.
- The moves of the game and the games played (`Game 1: …`) are in the history of the room, out of the table: a move
  joins it once its shot is over.
- While the seats are open, the seat of a player away shows `Free the seat` to the other player and to the host, a
  spectator included, as at poker.

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
