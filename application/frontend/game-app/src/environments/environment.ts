import EnvironmentInterface from './environment.interface';

export const environment: EnvironmentInterface = {
    production: true,
    iceServers: ['stun:stun.l.google.com:19302'],
    // The domain of the websocket API of the production stage (sc-ws-<stage> in infrastructure/main.tf)
    webSocketServer: 'wss://sc-ws-production.steins.fr',
};
