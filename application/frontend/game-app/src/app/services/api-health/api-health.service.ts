import { HttpClient } from '@angular/common/http';
import { inject, Injectable, Signal, signal } from '@angular/core';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { HTTP_API_WITH_CREDENTIALS } from '@app/services/room-api/http-api-with-credentials.token';
import { API_REQUEST_TIMEOUT } from '@app/services/room-api/api-request-timeout';
import HealthResponse from '@protocol/responses/health-response';
import { RoomApiHttpRoute } from '@protocol/room-api-http-route.enum';
import { defer, finalize, map, Observable, retry, share, timer } from 'rxjs';
import { ApiHealthState } from './api-health-state.enum';

/**
 * Whether the APIs are up: asked to GET /health of the HTTP API, which answers once its database answers, the paused
 * database resuming meanwhile. The pages using the APIs wait for it (apiHealthGuard): their requests then reach the
 * database awake
 */
@Injectable({
    providedIn: 'root',
})
export class ApiHealthService {
    /** How long a check takes before it tells the APIs are booting, in milliseconds */
    public static readonly BOOTING_DELAY: number = 3000;
    /** How long a failed check waits before it is asked again, in milliseconds */
    public static readonly RETRY_DELAY: number = 2000;

    private readonly httpClient = inject(HttpClient);
    private readonly httpApiServer: string = inject(HTTP_API_SERVER);
    private readonly withCredentials: boolean = inject(HTTP_API_WITH_CREDENTIALS);
    private readonly currentState = signal<ApiHealthState>(ApiHealthState.IDLE);

    public readonly state: Signal<ApiHealthState> = this.currentState.asReadonly();

    /** One check shared by the pages waiting for it, stopped once none waits */
    private readonly up$: Observable<true> = defer(() => {
        this.currentState.set(ApiHealthState.CHECKING);
        // Long to answer: the lambda starts, the paused database resumes
        const booting: ReturnType<typeof setTimeout> = setTimeout(() => this.currentState.set(ApiHealthState.BOOTING), ApiHealthService.BOOTING_DELAY);

        return this.httpClient.get<HealthResponse>(`${ this.httpApiServer }${ RoomApiHttpRoute.HEALTH }`, { timeout: API_REQUEST_TIMEOUT, withCredentials: this.withCredentials }).pipe(
            // Failed, timed out or refused: still booting, asked again
            retry({
                delay: (): Observable<0> => {
                    this.currentState.set(ApiHealthState.BOOTING);
                    return timer(ApiHealthService.RETRY_DELAY);
                },
            }),
            map((): true => true),
            finalize(() => {
                clearTimeout(booting);
                this.currentState.set(ApiHealthState.IDLE);
            }),
        );
    }).pipe(share());

    /** Emits once the APIs are up, a failed check asked again until then */
    public ensureUp(): Observable<true> {
        return this.up$;
    }
}
