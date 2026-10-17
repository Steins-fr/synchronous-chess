import { isBadRequestException } from '@exceptions/bad-request-exception';
import ErrorResponse from '@protocol/responses/error-response';
import { RoomApiHttpRoute } from '@protocol/room-api-http-route.enum';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getRoomsHandler } from './handlers/get-rooms-handler';

interface Response {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
}

/**
 * Resolves to the body of the response of a route
 * @throws {BadRequestException} when the request is refused
 */
type RouteHandler = (event: APIGatewayProxyEventV2) => Promise<object>;

const ERROR_NOT_FOUND: string = 'Not found';
const ERROR_SERVER: string = 'Server error.';

/**
 * The handlers of the routes, by their route key (`<method> <path>`): the routes of aws-api-gateway-http-routes in the
 * infrastructure, and HTTP_ROUTES of the local API
 */
const routeHandlers: ReadonlyMap<string, RouteHandler> = new Map<string, RouteHandler>([
    [`GET ${ RoomApiHttpRoute.ROOMS }`, getRoomsHandler],
]);

/** A JSON body. API Gateway adds the CORS headers (cors_configuration of the HTTP API), ignoring the ones of a lambda */
function jsonResponse(statusCode: number, body: object): Response {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/**
 * The routes of the HTTP API: what is not the connectivity of a room, which the websocket API serves. API Gateway
 * answers the routes it does not declare itself: a route without handler is answered not found all the same
 */
export const handler = async function (event: APIGatewayProxyEventV2): Promise<Response> {
    const routeHandler: RouteHandler | undefined = routeHandlers.get(event.routeKey);

    if (routeHandler === undefined) {
        return jsonResponse(404, { message: ERROR_NOT_FOUND } satisfies ErrorResponse);
    }

    try {
        return jsonResponse(200, await routeHandler(event));
    } catch (e) {
        console.error(e);

        if (isBadRequestException(e)) {
            return jsonResponse(400, { message: e.message } satisfies ErrorResponse);
        }

        // Never the message of the error: the client is told nothing of the database
        return jsonResponse(500, { message: ERROR_SERVER } satisfies ErrorResponse);
    }
};
