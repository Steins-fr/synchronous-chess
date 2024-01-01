import EnvironmentInterface from './environment.interface';

export const environment: EnvironmentInterface = {
    production: false,
    iceServers: ['stun:stun.l.google.com:19302'],
    // webSocketServer: "wss://ss-wss-staging.steins.fr",
    webSocketServer: 'wss://sc-ws-dev.steins.fr',
};
