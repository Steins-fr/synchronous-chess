declare global {
    namespace NodeJS {
        interface ProcessEnv {
            // Set by infrastructure/main.tf for each lambda using them only, and by the specs and the local server
            TABLE_NAME_CONNECTIONS?: string;
            TABLE_NAME_ROOMS?: string;
            TABLE_NAME_PASSWORD_ATTEMPTS?: string;
            /** The key of the hashes of the IPs of the clients (source.helper), kept secret */
            SOURCE_HASH_SECRET?: string;
            // Set by the local server only (local/server.ts): API Gateway is reached through its domain otherwise
            MANAGEMENT_API_ENDPOINT?: string;
        }
    }
}

type RequiredVariable = 'TABLE_NAME_CONNECTIONS' | 'TABLE_NAME_ROOMS' | 'TABLE_NAME_PASSWORD_ATTEMPTS' | 'SOURCE_HASH_SECRET';

/**
 * A variable a lambda can not run without: missing, the lambda fails at once, as it builds what reads it, rather than
 * once DynamoDB refuses a command without table
 * @throws {Error} when the environment does not give it, or gives it empty
 */
function requiredVariable(name: RequiredVariable, purpose: string): string {
    const value: string | undefined = process.env[name];

    if (!value) {
        throw new Error(`No ${ name }: ${ purpose }`);
    }

    return value;
}

/** @throws {Error} when the environment of the lambda does not give it */
export function getConnectionsTableName(): string {
    return requiredVariable('TABLE_NAME_CONNECTIONS', 'the table of the connections, set by infrastructure/main.tf for the lambdas reading it');
}

/** @throws {Error} when the environment of the lambda does not give it */
export function getRoomsTableName(): string {
    return requiredVariable('TABLE_NAME_ROOMS', 'the table of the rooms, set by infrastructure/main.tf for the lambdas reading it');
}

/** @throws {Error} when the environment of the lambda does not give it: only the lambda joining the rooms has it */
export function getPasswordAttemptsTableName(): string {
    return requiredVariable('TABLE_NAME_PASSWORD_ATTEMPTS', 'the table of the password attempts, set by infrastructure/main.tf for the lambda joining the rooms');
}

/**
 * The key of the hashes of the IPs of the clients
 * @throws {Error} when the environment does not give it: an IP would be hashed without a secret
 */
export function getSourceHashSecret(): string {
    return requiredVariable('SOURCE_HASH_SECRET', 'the IPs of the clients are hashed with a secret key');
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
