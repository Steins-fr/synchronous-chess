---
applyTo: 'application/shared/room-socket-protocol/**'
---
# Room WebSocket Protocol

The message types exchanged between the game app (`application/frontend/game-app`) and the websocket
API (`application/backend/websocket-api`): requests, responses, notifications, error messages and the
relayed WebRTC signal. Both packages import it as `@protocol/*`; it is never duplicated in either.

## Constraints

- Plain TypeScript, no `package.json` and no import of a package, Angular, Node or the DOM: the app
  runs in the browser, the API on Node. Copy a DOM type structurally when needed (see `rtc-signal.ts`,
  whose drift from the DOM is checked at compile time in the app's `webrtc.ts`)
- Imports between its files are relative, never through an alias
- Strict typing everywhere; use enum constants for the message types (not `const enum`: the app
  compiles with `isolatedModules`)
- Keep the runtime code small (enums, mappings, type guards for data received from the network)
- Breaking the message format is fine: the app and the API are deployed together, so no protocol
  versioning nor backward compatibility

## Testing

- No test runner of its own: its specs live in the app (`src/app/services/room-api/rtc-signal.spec.ts`)
  and the app's `npm run test:ci` measures its coverage, which must stay at 100% like the app's
- SonarCloud analyzes it with the app (`sonar.sources` of the game app workflows)

## Checks after a change

- From `application/backend/websocket-api`: `npm run lint` (lints the protocol too with its
  `eslint.config.mjs`) and `npm run typecheck`
- From `application/frontend/game-app`: `npm run lint` and `npm run test:ci`
