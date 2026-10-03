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

/** The endpoint of the API Gateway management API, to post to the connections of the websocket API */
export function getManagementApiEndpoint(domainName: string): string {
    return process.env.MANAGEMENT_API_ENDPOINT ?? `https://${domainName}`;
}
