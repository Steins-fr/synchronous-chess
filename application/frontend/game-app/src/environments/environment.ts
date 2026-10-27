import EnvironmentInterface from './environment.interface';

export const environment: EnvironmentInterface = {
    production: true,
    iceServers: ['stun:stun.l.google.com:19302'],
    // The domains of the websocket API and of the HTTP API of the production stage (sc-ws-<stage> and sc-api-<stage> in
    // infrastructure/main.tf)
    webSocketServer: 'wss://sc-ws-production.steins.fr',
    httpApiServer: 'https://sc-api-production.steins.fr',
    httpApiWithCredentials: false,
    webrtcDebug: false,
};
