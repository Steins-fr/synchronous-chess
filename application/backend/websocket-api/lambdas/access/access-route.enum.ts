/**
 * The routes of the login of a stage restricted to its owner, on its HTTP API (aws-api-gateway-http-routes): opened by
 * the owner and Cognito, never by the app, so apart from the routes of the protocol
 */
export enum AccessRoute {
    LOGIN = '/auth/login',
    CALLBACK = '/auth/callback',
}
