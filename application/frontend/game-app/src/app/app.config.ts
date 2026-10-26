import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners, provideEnvironmentInitializer, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withRouterConfig, withComponentInputBinding } from '@angular/router';
import { provideTranslation } from '@app/services/language/provide-translation';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { HTTP_API_WITH_CREDENTIALS } from '@app/services/room-api/http-api-with-credentials.token';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/web-socket-server.token';
import { VisitorPresenceService } from '@app/services/visitor-presence/visitor-presence.service';
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
                // A navigation refused (back, leaving a match) keeps the history as it was
                canceledNavigationResolution: 'computed',
            }),
        ),
        { provide: WEB_SOCKET_SERVER, useValue: environment.webSocketServer },
        { provide: HTTP_API_SERVER, useValue: environment.httpApiServer },
        { provide: HTTP_API_WITH_CREDENTIALS, useValue: environment.httpApiWithCredentials },
        ...provideTranslation(),
        // Listens as soon as the app starts: a gesture while the code and the texts of the page load tells a person too
        provideEnvironmentInitializer(() => inject(VisitorPresenceService)),
    ],
};
