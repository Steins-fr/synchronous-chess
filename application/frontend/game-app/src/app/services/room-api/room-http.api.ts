import { httpResource, HttpResourceRef, HttpResourceRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import RoomsRequest from '@protocol/requests/rooms-request';
import RoomsResponse from '@protocol/responses/rooms-response';
import { RoomApiHttpRoute } from '@protocol/room-api-http-route.enum';
import { API_REQUEST_TIMEOUT } from './api-request-timeout';
import { HTTP_API_SERVER } from './http-api-server.token';
import { HTTP_API_WITH_CREDENTIALS } from './http-api-with-credentials.token';

/**
 * The open rooms of a game, searched by a part of their name, asked again by reload(): a resource of the HTTP API, to
 * create in an injection context. A new request cancels the former one. HttpParams throws on a search it cannot encode
 * (a lone surrogate): the resource fails
 */
export function openRoomsResource(request: () => Readonly<RoomsRequest>): HttpResourceRef<RoomsResponse | undefined> {
    const httpApiServer: string = inject(HTTP_API_SERVER);
    const withCredentials: boolean = inject(HTTP_API_WITH_CREDENTIALS);

    return httpResource<RoomsResponse>((): HttpResourceRequest => {
        const { game, search }: Readonly<RoomsRequest> = request();

        return {
            url: `${ httpApiServer }${ RoomApiHttpRoute.ROOMS }`,
            // Without search, the most recent rooms: HttpParams would send an undefined search as a text
            params: search === undefined ? { game } : { game, search },
            timeout: API_REQUEST_TIMEOUT,
            withCredentials,
        };
    });
}
