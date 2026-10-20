/**
 * How long a request of the APIs, websocket or HTTP, waits for its response, in milliseconds: the lambdas wait for the
 * paused database to resume, 28 seconds at most (database_lambda_timeout of infrastructure/main.tf), and API Gateway
 * gives up on them after 29 (timeout_milliseconds of aws-api-gateway-http-routes, the limit of the WebSocket API)
 */
export const API_REQUEST_TIMEOUT: number = 30_000;
