import EnvironmentInterface from './environment.interface';

class Environment implements EnvironmentInterface{
    public production: boolean = false;
    public iceServers: string[] = ['stun:stun.l.google.com:19302'];
    public webSocketServer: string = 'wss://ss-wss-staging.steins.fr';
}

export const environment: Environment = new Environment();

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
