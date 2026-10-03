# Websocket Room API

## Build

Required: Room Manager Layer build artefacts because the lambdas imports build types from the `dist/` layer folder.

For each lambdas, go into the lambda repository then run `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory. 

## Development server

`npm run serve:local` runs the API locally, without AWS, on `ws://127.0.0.1:3001` (loopback only), and
restarts it when a file changes. `local/server.ts` emulates API Gateway around the lambdas: the websocket
routes (`$connect`, `sendmessage`, `$disconnect`) and the `PostToConnection` endpoint of the management API.
DynamoDB is emulated by [dynalite](https://github.com/architect/dynalite), in memory: the rooms are lost at
each restart.

Then serve the game app against it, from `application/frontend/game-app`: `npm run serve:local`.

Emulated limits: 32 KB per message received (one frame of API Gateway, where a browser sends each message
in a single frame) and 128 KB per message posted to a connection. Not emulated: the authorization and the
other limits of API Gateway (idle timeout, connection duration, throttling). The staging environment on AWS
remains the reference.
