import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withRouterConfig, withComponentInputBinding } from '@angular/router';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/web-socket-server.token';
import { environment } from '@environments/environment';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideZonelessChangeDetection(),
        provideRouter(
            routes,
            // withDebugTracing(),
            withComponentInputBinding(),
            withRouterConfig({
                paramsInheritanceStrategy: 'always',
            }),
        ),
        { provide: WEB_SOCKET_SERVER, useValue: environment.webSocketServer },
    ],
};
