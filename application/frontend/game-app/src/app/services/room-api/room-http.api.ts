import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import RoomsRequest from '@protocol/requests/rooms-request';
import RoomsResponse from '@protocol/responses/rooms-response';
import { RoomApiHttpRoute } from '@protocol/room-api-http-route.enum';
import { defer, Observable, tap } from 'rxjs';
import { HTTP_API_SERVER } from './http-api-server.token';

/** The HTTP API: what is not the connectivity of a room, which the socket of the page serves */
@Injectable({
    providedIn: 'root',
})
export class RoomHttpApi {
    /**
     * How long a request waits for its response, in milliseconds: the lambda waits for the paused database to resume,
     * 28 seconds at most, and API Gateway gives up on it after 29
     */
    private static readonly REQUEST_TIMEOUT: number = 30_000;

    private readonly httpClient = inject(HttpClient);
    private readonly httpApiServer: string = inject(HTTP_API_SERVER);

    /**
     * The open rooms of a game, searched by a part of their name. Fails once refused, failed, timed out or blocked, or
     * when the request cannot be built, the failure logged; the request is cancelled by an unsubscription
     */
    public getOpenRooms(request: Readonly<RoomsRequest>): Observable<RoomsResponse> {
        const { game, search }: Readonly<RoomsRequest> = request;

        // Built at the subscription: HttpParams throws on a search it cannot encode (a lone surrogate), failing the
        // request rather than its caller
        return defer(() => this.httpClient.get<RoomsResponse>(`${ this.httpApiServer }${ RoomApiHttpRoute.ROOMS }`, {
            // Without search, the most recent rooms: HttpParams would send an undefined search as a text
            params: search === undefined ? { game } : { game, search },
            timeout: RoomHttpApi.REQUEST_TIMEOUT,
        })).pipe(
            tap({ error: (error: unknown) => console.error('The open rooms could not be listed', error) }),
        );
    }
}
