declare global {
    namespace NodeJS {
        interface ProcessEnv {
            TABLE_NAME_CONNECTIONS: string;
            TABLE_NAME_ROOMS: string;
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
