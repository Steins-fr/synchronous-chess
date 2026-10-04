# Websocket Room API

## Build

`npm run build` bundles the three lambdas with esbuild into `dist/` (`onconnect.mjs`, `ondisconnect.mjs`,
`sendmessage.mjs`), deployed by Terraform.

## Development server

`npm run serve:local` runs the API locally, without AWS, on `ws://127.0.0.1:3001` (loopback only), and
restarts it when a file changes. `local/local-api.ts` emulates API Gateway around the lambdas: the websocket
routes (`$connect`, `sendmessage`, `ping`, `$disconnect`) and the `PostToConnection` endpoint of the management API.
DynamoDB is emulated by [dynalite](https://github.com/architect/dynalite), in memory: the rooms are lost at
each restart.

Then serve the game app against it, from `application/frontend/game-app`: `npm run serve:local`.

Emulated limits: 32 KB per message received (one frame of API Gateway, where a browser sends each message
in a single frame), 128 KB per message posted to a connection, and the connections closed (1001) after
10 minutes without message in either direction, or after 2 hours. Not emulated: the authorization and the
throttling. The staging environment on AWS remains the reference.

The emulation is tested by `local/local-api.spec.ts`, run with the specs of the lambdas. Through dynalite, it also
checks the condition expressions of the writes (the room creation and the reconnection of its host), which the
mocks of DynamoDB in the other specs do not evaluate.

## Host reconnection

API Gateway closes any connection after 2 hours, and the host keeps its connection open while it waits for the
players. Each page sends a secret token of its own with `create` and `join` (the room keeps its SHA-256 by player,
`tokenHashes`, until the player is removed). Every 100 minutes, or as soon as its socket closes, the host opens a new
socket and sends it `reconnect` with its name and token: the room moves
to the new connection, then the former socket closes. When the host connection closes before, `$disconnect` keeps
the room for 10 minutes (`expiresAt`, also the TTL of the table): joins are refused (`Host disconnected`) until the
host reconnects, and the room keeps its name until it expires. Meanwhile, a player of the room can take it over with
`reconnect` and its own name and token: the room moves to its connection, and it becomes the host (`Host connected`
while the former host connection is still open).
