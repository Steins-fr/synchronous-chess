declare global {
    namespace NodeJS {
        interface ProcessEnv {
            TABLE_NAME_CONNECTIONS: string;
            TABLE_NAME_ROOMS: string;
        }
    }
}

export function getConnectionsTableName(): string {
    return process.env.TABLE_NAME_CONNECTIONS;
}

export function getRoomsTableName(): string {
    return process.env.TABLE_NAME_ROOMS;
}
