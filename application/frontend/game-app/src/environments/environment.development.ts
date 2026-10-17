import EnvironmentInterface from './environment.interface';

export const environment: EnvironmentInterface = {
    production: false,
    iceServers: ['stun:stun.l.google.com:19302'],
    // The domains of the websocket API and of the HTTP API of the stage (sc-ws-<stage> and sc-api-<stage> in
    // infrastructure/main.tf)
    webSocketServer: 'wss://sc-ws-development.steins.fr',
    httpApiServer: 'https://sc-api-development.steins.fr',
};
