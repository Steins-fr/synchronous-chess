import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { HTTP_API_WITH_CREDENTIALS } from '@app/services/room-api/http-api-with-credentials.token';
import { TEST_HTTP_API_SERVER } from '@testing/open-rooms.http';
import { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiHealthState } from './api-health-state.enum';
import { ApiHealthService } from './api-health.service';

describe('ApiHealthService', () => {
    const HEALTH: string = `${ TEST_HTTP_API_SERVER }/health`;
    let service: ApiHealthService;
    let httpTesting: HttpTestingController;
    let ups: number;

    function ensureUp(): Subscription {
        return service.ensureUp().subscribe(() => ups++);
    }

    beforeEach(() => {
        vi.useFakeTimers();
        ups = 0;
        TestBed.configureTestingModule({ providers: [{ provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER }] });
        service = TestBed.inject(ApiHealthService);
        httpTesting = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpTesting.verify();
        vi.useRealTimers();
    });

    test('should be idle until asked', () => {
        expect(service.state()).toEqual(ApiHealthState.IDLE);
    });

    test('should check the APIs, then tell they are up', () => {
        // When
        ensureUp();

        // Then
        expect(service.state()).toEqual(ApiHealthState.CHECKING);

        // When
        const request: TestRequest = httpTesting.expectOne(HEALTH);
        request.flush({ status: 'up' });

        // Then: without the cookies of the browser, unless the stage is restricted
        expect(request.request.timeout).toEqual(30_000);
        expect(request.request.withCredentials).toBe(false);
        expect(ups).toEqual(1);
        expect(service.state()).toEqual(ApiHealthState.IDLE);
    });

    test('should check the APIs with the cookies of the browser on a stage restricted to its owner', () => {
        // Given
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                { provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER },
                { provide: HTTP_API_WITH_CREDENTIALS, useValue: true },
            ],
        });
        service = TestBed.inject(ApiHealthService);
        httpTesting = TestBed.inject(HttpTestingController);

        // When
        ensureUp();
        const request: TestRequest = httpTesting.expectOne(HEALTH);
        request.flush({ status: 'up' });

        // Then
        expect(request.request.withCredentials).toBe(true);
        expect(ups).toEqual(1);
    });

    test('should tell the APIs are booting once the check takes 3 seconds', async () => {
        // Given
        ensureUp();

        // When
        await vi.advanceTimersByTimeAsync(ApiHealthService.BOOTING_DELAY - 1);

        // Then
        expect(service.state()).toEqual(ApiHealthState.CHECKING);

        // When
        await vi.advanceTimersByTimeAsync(1);

        // Then
        expect(service.state()).toEqual(ApiHealthState.BOOTING);

        // When
        httpTesting.expectOne(HEALTH).flush({ status: 'up' });

        // Then
        expect(ups).toEqual(1);
        expect(service.state()).toEqual(ApiHealthState.IDLE);
    });

    test('should ask a failed check again, the APIs booting meanwhile', async () => {
        // Given
        ensureUp();

        // When
        httpTesting.expectOne(HEALTH).flush({ message: 'Service Unavailable' }, { status: 503, statusText: 'Service Unavailable' });

        // Then
        expect(service.state()).toEqual(ApiHealthState.BOOTING);
        httpTesting.expectNone(HEALTH);

        // When
        await vi.advanceTimersByTimeAsync(ApiHealthService.RETRY_DELAY);
        httpTesting.expectOne(HEALTH).flush({ status: 'up' });

        // Then
        expect(ups).toEqual(1);
        expect(service.state()).toEqual(ApiHealthState.IDLE);
    });

    test('should share one check between the pages waiting for it', () => {
        // When
        ensureUp();
        ensureUp();
        httpTesting.expectOne(HEALTH).flush({ status: 'up' });

        // Then
        expect(ups).toEqual(2);
    });

    test('should stop checking once no page waits for it', async () => {
        // Given
        const waiting: Subscription = ensureUp();
        const request: TestRequest = httpTesting.expectOne(HEALTH);

        // When
        waiting.unsubscribe();
        await vi.advanceTimersByTimeAsync(ApiHealthService.BOOTING_DELAY);

        // Then
        expect(request.cancelled).toBe(true);
        expect(service.state()).toEqual(ApiHealthState.IDLE);
    });
});
