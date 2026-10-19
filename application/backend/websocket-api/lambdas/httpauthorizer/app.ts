import { environmentAccessKey, isAccessGranted } from '@helpers/access-cookie.helper';
import { parseCookies } from '@helpers/cookie.helper';
import { epochSeconds } from '@helpers/time.helper';
import { APIGatewayRequestAuthorizerEventV2, APIGatewaySimpleAuthorizerResult } from 'aws-lambda';

/**
 * The authorizer of the routes of the HTTP API on a stage restricted to its owner: a request passes with the access cookies
 * of the front, sent by the pages of the stage (withCredentials), else 403. Run at each request, without cache: its
 * identity is the cookies, which API Gateway gives apart from the headers (`cookies`, left out without any)
 */
export const handler = function (event: APIGatewayRequestAuthorizerEventV2): Promise<APIGatewaySimpleAuthorizerResult> {
    return Promise.resolve({ isAuthorized: isAccessGranted(parseCookies(event.cookies), environmentAccessKey(), epochSeconds()) });
};
