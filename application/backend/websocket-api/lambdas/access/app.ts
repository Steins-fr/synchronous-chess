import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { AccessResponse, textResponse } from './access-response';
import { AccessRoute } from './access-route.enum';
import { callbackHandler } from './handlers/callback-handler';
import { loginHandler } from './handlers/login-handler';

type RouteHandler = (event: APIGatewayProxyEventV2) => Promise<AccessResponse>;

/** The handlers of the routes, by their route key (`<method> <path>`): the access routes of aws-api-gateway-http-routes */
const routeHandlers: ReadonlyMap<string, RouteHandler> = new Map<string, RouteHandler>([
    [`GET ${ AccessRoute.LOGIN }`, loginHandler],
    [`GET ${ AccessRoute.CALLBACK }`, callbackHandler],
]);

/**
 * The login of the owner of a restricted stage, on its HTTP API, outside its authorizer: it sets the access cookies the
 * front and the APIs of the stage check. Loads the key signing them from its SSM parameter (access-signing-key.helper). A
 * failure of the token endpoint fails the lambda: API Gateway answers 500
 */
export const handler = function (event: APIGatewayProxyEventV2): Promise<AccessResponse> {
    const routeHandler: RouteHandler | undefined = routeHandlers.get(event.routeKey);
    return routeHandler === undefined ? Promise.resolve(textResponse(404, 'Not found')) : routeHandler(event);
};
