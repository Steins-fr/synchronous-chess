# Websocket Room API

## Build

Required: Room Manager Layer build artefacts because the lambdas imports build types from the `dist/` layer folder.

For each lambdas, go into the lambda repository then run `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory. 

## Development server

It is difficult to host locally a Websocket API that mimic AWS services. So prefer deploying the app to a AWS development environment with terraform.
