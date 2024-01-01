import { ApplicationConfig } from '@angular/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideRouter } from '@angular/router';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/room-api.service';
import { environment } from '@environments/environment';

import { routes } from './app.routes';
import { provideAnimations } from '@angular/platform-browser/animations';

export const appConfig: ApplicationConfig = {
    providers: [
        provideRouter(routes),
        provideAnimations(),
        { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } },
        { provide: WEB_SOCKET_SERVER, useValue: environment.webSocketServer },
    ],
};
