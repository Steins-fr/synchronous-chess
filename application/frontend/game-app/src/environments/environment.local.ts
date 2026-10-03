import EnvironmentInterface from './environment.interface';

// The websocket API run locally: `npm run serve:local` in application/backend/websocket-api
export const environment: EnvironmentInterface = {
    production: false,
    iceServers: ['stun:stun.l.google.com:19302'],
    webSocketServer: 'ws://127.0.0.1:3001',
};
