# Websocket Room API

## Build

`npm run build` bundles the three lambdas with esbuild into `dist/` (`onconnect.mjs`, `ondisconnect.mjs`,
`sendmessage.mjs`), deployed by Terraform.

## Development server

`npm run serve:local` runs the API locally, without AWS, on `ws://127.0.0.1:3001` (loopback only), and
restarts it when a file changes. `local/local-api.ts` emulates API Gateway around the lambdas: the websocket
routes (`$connect`, `sendmessage`, `$disconnect`) and the `PostToConnection` endpoint of the management API.
DynamoDB is emulated by [dynalite](https://github.com/architect/dynalite), in memory: the rooms are lost at
each restart.

Then serve the game app against it, from `application/frontend/game-app`: `npm run serve:local`.

Emulated limits: 32 KB per message received (one frame of API Gateway, where a browser sends each message
in a single frame), 128 KB per message posted to a connection, and the connections closed (1001) after
10 minutes without message in either direction, or after 2 hours. Not emulated: the authorization and the
throttling. The staging environment on AWS remains the reference.

The emulation is tested by `local/local-api.spec.ts`, run with the specs of the lambdas.
