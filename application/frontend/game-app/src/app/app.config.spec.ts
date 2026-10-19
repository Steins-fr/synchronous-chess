import { TestBed } from '@angular/core/testing';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { HTTP_API_WITH_CREDENTIALS } from '@app/services/room-api/http-api-with-credentials.token';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/web-socket-server.token';
import { environment } from '@environments/environment';
import { describe, expect, test } from 'vitest';
import { appConfig } from './app.config';

describe('appConfig', () => {
    test('should provide the application settings', () => {
        // Given
        TestBed.configureTestingModule({ providers: appConfig.providers });

        // When
        const webSocketServer: string = TestBed.inject(WEB_SOCKET_SERVER);
        const httpApiServer: string = TestBed.inject(HTTP_API_SERVER);
        const httpApiWithCredentials: boolean = TestBed.inject(HTTP_API_WITH_CREDENTIALS);

        // Then
        expect(webSocketServer).toEqual(environment.webSocketServer);
        expect(httpApiServer).toEqual(environment.httpApiServer);
        expect(httpApiWithCredentials).toEqual(environment.httpApiWithCredentials);
    });
});
