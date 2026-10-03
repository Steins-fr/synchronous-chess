# Websocket Room API

## Build

Required: Room Manager Layer build artefacts because the lambdas imports build types from the `dist/` layer folder.

For each lambdas, go into the lambda repository then run `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory. 

## Development server

`npm run serve:local` runs the API locally, without AWS, on `ws://localhost:3001`, and restarts it when a
file changes. `local/server.ts` emulates API Gateway around the lambdas: the websocket routes (`$connect`,
`sendmessage`, `$disconnect`) and the `PostToConnection` endpoint of the management API. DynamoDB is
emulated by [dynalite](https://github.com/architect/dynalite), in memory: the rooms are lost at each restart.

Then serve the game app against it, from `application/frontend/game-app`: `npm run serve:local`.

Not emulated: the authorization and the limits of API Gateway other than the size of the messages
(idle timeout, connection duration, throttling). The staging environment on AWS remains the reference.
