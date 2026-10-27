export default interface EnvironmentInterface {
    production: boolean;
    iceServers: string[];
    webSocketServer: string;
    /** The HTTPS API, without trailing slash: what is not the connectivity of a room, which the websocket API serves */
    httpApiServer: string;
    /**
     * Whether the requests to the HTTP API send the cookies of the browser: the access cookies of a stage restricted to
     * its owner (staging), which its authorizer checks. The websocket sends them with its handshake anyway
     */
    httpApiWithCredentials: boolean;
    /**
     * Whether the pages of a room offer the debug panel of WebRTC, a floating button opening it in a bottom sheet:
     * developer tooling, on the local and staging stages
     */
    webrtcDebug: boolean;
}
