import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withRouterConfig, withComponentInputBinding } from '@angular/router';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/room-socket.api';
import { environment } from '@environments/environment';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
    providers: [
        provideZonelessChangeDetection(),
        provideRouter(
            routes,
            // withDebugTracing(),
            withComponentInputBinding(),
            withRouterConfig({
                paramsInheritanceStrategy: 'always',
            }),
        ),
        provideAnimations(),
        { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } },
        { provide: WEB_SOCKET_SERVER, useValue: environment.webSocketServer },
    ],
};
