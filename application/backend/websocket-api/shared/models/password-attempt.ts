/** The passwords a client gave a private room in a row, counted before being checked (PasswordAttemptRepository) */
export default interface PasswordAttempt {
    roomName: string;
    /** The hash of the IP of the client (source.helper) */
    source: string;
    attempts: number;
    /**
     * In epoch seconds, pushed back by each attempt counted: the count starts again then. The TTL of the table deletes
     * the item afterwards, within a few days
     */
    expiresAt: number;
}
