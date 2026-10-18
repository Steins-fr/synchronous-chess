import { httpResource, HttpResourceRef, HttpResourceRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import RoomsRequest from '@protocol/requests/rooms-request';
import RoomsResponse from '@protocol/responses/rooms-response';
import { RoomApiHttpRoute } from '@protocol/room-api-http-route.enum';
import { HTTP_API_SERVER } from './http-api-server.token';

/**
 * How long a request waits for its response, in milliseconds: the lambda waits for the paused database to resume, 28
 * seconds at most, and API Gateway gives up on it after 29
 */
export const HTTP_API_TIMEOUT: number = 30_000;

/**
 * The open rooms of a game, searched by a part of their name, asked again by reload(): a resource of the HTTP API, to
 * create in an injection context. A new request cancels the former one; none waits (idle) without request. HttpParams
 * throws on a search it cannot encode (a lone surrogate): the resource fails
 */
export function openRoomsResource(request: () => Readonly<RoomsRequest> | undefined): HttpResourceRef<RoomsResponse | undefined> {
    const httpApiServer: string = inject(HTTP_API_SERVER);

    return httpResource<RoomsResponse>((): HttpResourceRequest | undefined => {
        const roomsRequest: Readonly<RoomsRequest> | undefined = request();
        if (roomsRequest === undefined) {
            return undefined;
        }

        const { game, search }: Readonly<RoomsRequest> = roomsRequest;

        return {
            url: `${ httpApiServer }${ RoomApiHttpRoute.ROOMS }`,
            // Without search, the most recent rooms: HttpParams would send an undefined search as a text
            params: search === undefined ? { game } : { game, search },
            timeout: HTTP_API_TIMEOUT,
        };
    });
}
