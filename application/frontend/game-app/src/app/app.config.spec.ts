import { TestBed } from '@angular/core/testing';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldDefaultOptions } from '@angular/material/form-field';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/room-socket.api';
import { environment } from '@environments/environment';
import { describe, expect, test } from 'vitest';
import { appConfig } from './app.config';

describe('appConfig', () => {
    test('should provide the application settings', () => {
        // Given
        TestBed.configureTestingModule({ providers: appConfig.providers });

        // When
        const webSocketServer: string = TestBed.inject(WEB_SOCKET_SERVER);
        const formFieldOptions: MatFormFieldDefaultOptions = TestBed.inject(MAT_FORM_FIELD_DEFAULT_OPTIONS);

        // Then
        expect(webSocketServer).toEqual(environment.webSocketServer);
        expect(formFieldOptions.appearance).toEqual('outline');
    });
});
