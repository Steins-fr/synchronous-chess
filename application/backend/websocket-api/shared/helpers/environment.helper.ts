declare global {
    namespace NodeJS {
        interface ProcessEnv {
            // The Aurora cluster the lambdas reach through its Data API, set by infrastructure/main.tf for each lambda
            // reading the database. The local server and the specs give their database instead (useDatabase)
            DATABASE_RESOURCE_ARN?: string;
            DATABASE_SECRET_ARN?: string;
            DATABASE_NAME?: string;
            /** The key of the hashes of the IPs of the clients (source.helper), kept secret */
            SOURCE_HASH_SECRET?: string;
            // Set by the local server only (local/server.ts): API Gateway is reached through its domain otherwise
            MANAGEMENT_API_ENDPOINT?: string;
        }
    }
}

type RequiredVariable = 'DATABASE_RESOURCE_ARN' | 'DATABASE_SECRET_ARN' | 'DATABASE_NAME' | 'SOURCE_HASH_SECRET';

/**
 * A variable a lambda can not run without: missing, the lambda fails as soon as it reads it, rather than once AWS refuses
 * a request without it
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
export function getDatabaseResourceArn(): string {
    return requiredVariable('DATABASE_RESOURCE_ARN', 'the ARN of the Aurora cluster, set by infrastructure/main.tf for the lambdas reading it');
}

/** @throws {Error} when the environment of the lambda does not give it */
export function getDatabaseSecretArn(): string {
    return requiredVariable('DATABASE_SECRET_ARN', 'the ARN of the secret of the Aurora cluster, set by infrastructure/main.tf for the lambdas reading it');
}

/** @throws {Error} when the environment of the lambda does not give it */
export function getDatabaseName(): string {
    return requiredVariable('DATABASE_NAME', 'the database of the Aurora cluster, set by infrastructure/main.tf for the lambdas reading it');
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
