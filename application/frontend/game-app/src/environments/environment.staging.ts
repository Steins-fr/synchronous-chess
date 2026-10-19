import EnvironmentInterface from './environment.interface';

export const environment: EnvironmentInterface = {
    production: true,
    iceServers: ['stun:stun.l.google.com:19302'],
    webSocketServer: 'wss://sc-ws-staging.steins.fr',
    httpApiServer: 'https://sc-api-staging.steins.fr',
    // Restricted to its owner: the HTTP API refuses the requests without the access cookies of the login
    httpApiWithCredentials: true,
};
