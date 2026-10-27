import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { WEBRTC_DEBUG } from '@app/modules/debug/webrtc-debug.token';
import { Language } from '@app/services/language/enums/language.enum';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { HTTP_API_WITH_CREDENTIALS } from '@app/services/room-api/http-api-with-credentials.token';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/web-socket-server.token';
import { VisitorPresenceService } from '@app/services/visitor-presence/visitor-presence.service';
import { environment } from '@environments/environment';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { appConfig } from './app.config';

describe('appConfig', () => {
    afterEach(() => {
        // @ts-expect-error The API of a spec only, missing from jsdom
        delete window.performance.getEntriesByType;
        vi.restoreAllMocks();
    });

    test('should provide the application settings', () => {
        // Given
        TestBed.configureTestingModule({ providers: appConfig.providers });

        // When
        const webSocketServer: string = TestBed.inject(WEB_SOCKET_SERVER);
        const httpApiServer: string = TestBed.inject(HTTP_API_SERVER);
        const httpApiWithCredentials: boolean = TestBed.inject(HTTP_API_WITH_CREDENTIALS);
        const webrtcDebug: boolean = TestBed.inject(WEBRTC_DEBUG);

        // Then
        expect(webSocketServer).toEqual(environment.webSocketServer);
        expect(httpApiServer).toEqual(environment.httpApiServer);
        expect(httpApiWithCredentials).toEqual(environment.httpApiWithCredentials);
        expect(webrtcDebug).toEqual(environment.webrtcDebug);
        // Off in the specs, as its default: provided by the config all the same
        expect(appConfig.providers).toContainEqual({ provide: WEBRTC_DEBUG, useValue: environment.webrtcDebug });
    });

    test('should listen for a person on the page as soon as the app starts', () => {
        // Given: the service itself, the specs providing a person on the page; jsdom has no navigation entries
        window.performance.getEntriesByType = vi.fn((): PerformanceEntryList => []);
        const added = vi.spyOn(document, 'addEventListener');
        TestBed.configureTestingModule({ providers: [...appConfig.providers, VisitorPresenceService] });

        // When
        TestBed.inject(ApplicationInitStatus);

        // Then
        expect(added).toHaveBeenCalledWith('pointermove', expect.any(Function), { capture: true, passive: true });
    });

    test('should load the language of the user before the app starts', async () => {
        // Given
        vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR']);
        TestBed.configureTestingModule({ providers: appConfig.providers });

        // When
        await TestBed.inject(ApplicationInitStatus).donePromise;

        // Then
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        expect(transloco.getActiveLang()).toBe(Language.FR);
        expect(transloco.translate('app.title')).toBe('Échecs synchrones');
    });
});
