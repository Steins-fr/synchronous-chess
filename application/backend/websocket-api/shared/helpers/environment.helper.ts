declare global {
    namespace NodeJS {
        interface ProcessEnv {
            // The Aurora cluster the lambdas reach through its Data API, set by infrastructure/main.tf for each lambda
            // reading the database. The local server and the specs give their database instead (useDatabase)
            DATABASE_RESOURCE_ARN?: string;
            DATABASE_SECRET_ARN?: string;
            DATABASE_NAME?: string;
            /**
             * The key of the hashes of the IPs of the clients (source.helper), given by the local server and the specs
             * only: on AWS, sendmessage reads it from its parameter, kept out of the configuration of the lambda
             */
            SOURCE_HASH_SECRET?: string;
            /** The SSM parameter (SecureString) holding that key, set by infrastructure/main.tf for sendmessage */
            SOURCE_HASH_SECRET_PARAMETER?: string;
            // Set by the local server only (local/server.ts): API Gateway is reached through its domain otherwise
            MANAGEMENT_API_ENDPOINT?: string;
            // The access of a stage restricted to its owner (staging), set by infrastructure/main.tf for its authorizers
            // and its access lambda: the public key of the signed cookies (SPKI DER in base64), its ID in CloudFront, and
            // the URL of the front they open
            ACCESS_PUBLIC_KEY?: string;
            ACCESS_KEY_PAIR_ID?: string;
            ACCESS_FRONT_URL?: string;
            // The access lambda only: the SSM parameter (SecureString) of the private key signing the cookies, the domain
            // of the cookies, the managed login of Cognito, the app client signing in and the callback of the login
            ACCESS_SIGNING_KEY_PARAMETER?: string;
            ACCESS_COOKIE_DOMAIN?: string;
            ACCESS_LOGIN_URL?: string;
            ACCESS_CLIENT_ID?: string;
            ACCESS_CALLBACK_URL?: string;
        }
    }
}

type RequiredVariable =
    | 'DATABASE_RESOURCE_ARN'
    | 'DATABASE_SECRET_ARN'
    | 'DATABASE_NAME'
    | 'SOURCE_HASH_SECRET_PARAMETER'
    | 'ACCESS_PUBLIC_KEY'
    | 'ACCESS_KEY_PAIR_ID'
    | 'ACCESS_FRONT_URL'
    | 'ACCESS_SIGNING_KEY_PARAMETER'
    | 'ACCESS_COOKIE_DOMAIN'
    | 'ACCESS_LOGIN_URL'
    | 'ACCESS_CLIENT_ID'
    | 'ACCESS_CALLBACK_URL';

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

/** The key of the hashes of the IPs of the clients, when the environment gives it: the local server and the specs only */
export function getSourceHashSecret(): string | undefined {
    const secret: string | undefined = process.env.SOURCE_HASH_SECRET;

    if (!secret) {
        return undefined;
    }

    return secret;
}

/**
 * The parameter holding the key of the hashes of the IPs of the clients, without the key itself
 * @throws {Error} when the environment of the lambda does not give it: an IP would be hashed without a secret
 */
export function getSourceHashSecretParameter(): string {
    return requiredVariable('SOURCE_HASH_SECRET_PARAMETER', 'the SSM parameter of the key of the hashes of the IPs, set by infrastructure/main.tf for sendmessage');
}

/** @throws {Error} when the environment of the lambda does not give it */
export function getAccessPublicKey(): string {
    return requiredVariable('ACCESS_PUBLIC_KEY', 'the public key of the access cookies, set by infrastructure/main.tf on a restricted stage');
}

/** @throws {Error} when the environment of the lambda does not give it */
export function getAccessKeyPairId(): string {
    return requiredVariable('ACCESS_KEY_PAIR_ID', 'the ID of the public key of the access cookies in CloudFront, set by infrastructure/main.tf on a restricted stage');
}

/**
 * The URL of the front of the stage, with its trailing slash: the access cookies open it, and all its files
 * @throws {Error} when the environment of the lambda does not give it
 */
export function getAccessFrontUrl(): string {
    return requiredVariable('ACCESS_FRONT_URL', 'the URL of the front the access cookies open, set by infrastructure/main.tf on a restricted stage');
}

/**
 * The parameter holding the private key signing the access cookies, without the key itself
 * @throws {Error} when the environment of the lambda does not give it
 */
export function getAccessSigningKeyParameter(): string {
    return requiredVariable('ACCESS_SIGNING_KEY_PARAMETER', 'the SSM parameter of the key signing the access cookies, set by infrastructure/main.tf for the access lambda');
}

/** @throws {Error} when the environment of the lambda does not give it */
export function getAccessCookieDomain(): string {
    return requiredVariable('ACCESS_COOKIE_DOMAIN', 'the domain of the access cookies, set by infrastructure/main.tf for the access lambda');
}

/**
 * The managed login of the user pool, without trailing slash: its authorize and token endpoints
 * @throws {Error} when the environment of the lambda does not give it
 */
export function getAccessLoginUrl(): string {
    return requiredVariable('ACCESS_LOGIN_URL', 'the managed login of Cognito, set by infrastructure/main.tf for the access lambda');
}

/** @throws {Error} when the environment of the lambda does not give it */
export function getAccessClientId(): string {
    return requiredVariable('ACCESS_CLIENT_ID', 'the app client of the login, set by infrastructure/main.tf for the access lambda');
}

/** @throws {Error} when the environment of the lambda does not give it */
export function getAccessCallbackUrl(): string {
    return requiredVariable('ACCESS_CALLBACK_URL', 'the callback of the login, set by infrastructure/main.tf for the access lambda');
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
