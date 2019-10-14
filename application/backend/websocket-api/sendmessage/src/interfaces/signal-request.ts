export default interface SignalRequest {
    roomName: string;
    to: string; // Player name (destination)
    signal: string; // Signal stringified
}
