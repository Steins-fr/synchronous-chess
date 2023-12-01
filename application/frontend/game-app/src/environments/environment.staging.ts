import EnvironmentInterface from './environment.interface';

export const environment: EnvironmentInterface = {
    production: true,
    iceServers: ['stun:stun.l.google.com:19302'],
    webSocketServer: 'wss://ss-wss-staging.steins.fr',
};
