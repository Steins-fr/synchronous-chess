import EnvironmentInterface from './environment.interface';

class Environment implements EnvironmentInterface {
    public production: boolean = true;
    public iceServers: string[] = ['stun:stun.l.google.com:19302'];
    public webSocketServer: string = 'wss://no-socket.steins.fr';
}

export const environment: Environment = new Environment();
