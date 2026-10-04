import { TestBed } from '@angular/core/testing';
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

        // Then
        expect(webSocketServer).toEqual(environment.webSocketServer);
    });
});
