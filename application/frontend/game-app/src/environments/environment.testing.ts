import EnvironmentInterface from './environment.interface';

export const environment: EnvironmentInterface = {
    production: true,
    iceServers: ['stun:stun.l.google.com:19302'],
    webSocketServer: 'wss://no-socket.steins.fr',
};
