declare global {
    namespace NodeJS {
        interface ProcessEnv {
            TABLE_NAME_CONNECTIONS: string;
            TABLE_NAME_ROOMS: string;
            TABLE_NAME_PASSWORD_ATTEMPTS: string;
            /** The key of the hashes of the IPs of the clients (source.helper), kept secret */
            SOURCE_HASH_SECRET: string;
            // Set by the local server only (local/server.ts): API Gateway is reached through its domain otherwise
            MANAGEMENT_API_ENDPOINT?: string;
        }
    }
}

export function getConnectionsTableName(): string {
    return process.env.TABLE_NAME_CONNECTIONS;
}

export function getRoomsTableName(): string {
    return process.env.TABLE_NAME_ROOMS;
}

export function getPasswordAttemptsTableName(): string {
    return process.env.TABLE_NAME_PASSWORD_ATTEMPTS;
}

/**
 * The key of the hashes of the IPs of the clients
 * @throws {Error} when the environment does not give it: an IP would be hashed without a secret
 */
export function getSourceHashSecret(): string {
    const secret: string | undefined = process.env.SOURCE_HASH_SECRET;

    if (!secret) {
        throw new Error('No SOURCE_HASH_SECRET: the IPs of the clients are hashed with a secret key');
    }

    return secret;
}

/**
 * The endpoint of the API Gateway management API, to post to the connections of the websocket API
 * @throws {Error} when neither the environment nor the event give it
 */
export function getManagementApiEndpoint(domainName: string | undefined): string {
    const endpoint: string | undefined = process.env.MANAGEMENT_API_ENDPOINT;

    if (endpoint) {
        return endpoint;
    }

    if (domainName) {
        return `https://${domainName}`;
    }

    throw new Error('No endpoint for the management API: neither MANAGEMENT_API_ENDPOINT nor the domain name of the event');
}
