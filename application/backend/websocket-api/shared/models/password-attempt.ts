/** The passwords a client gave a private room in a row, counted before being checked (PasswordAttemptRepository) */
export default interface PasswordAttempt {
    /** The name of the room and its creation date: a room created again under the same name has a count of its own */
    roomKey: string;
    /** The hash of the IP of the client (source.helper) */
    sourceHash: string;
    attempts: number;
    /**
     * In epoch seconds, pushed back by each attempt counted: the count starts again then. The TTL of the table deletes
     * the item afterwards, within a few days
     */
    expiresAt: number;
}
