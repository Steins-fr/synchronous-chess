
class Environment {
    public production: boolean = true;
    public iceServers: Array<string> = ['stun:stun.l.google.com:19302'];
    public webSocketServer: string = 'wss://ss-wss-staging.steins.fr';
}

export const environment: Environment = new Environment();
