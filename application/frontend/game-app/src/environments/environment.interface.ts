export default interface EnvironmentInterface {
    production: boolean;
    iceServers: string[];
    webSocketServer: string;
    /** The HTTPS API, without trailing slash: what is not the connectivity of a room, which the websocket API serves */
    httpApiServer: string;
}
