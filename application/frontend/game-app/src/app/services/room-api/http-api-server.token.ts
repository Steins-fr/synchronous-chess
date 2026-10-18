import { InjectionToken } from '@angular/core';

// The URL of the HTTP API. In a file of its own: the config of the app provides it, and importing it from room-http.api
// would put the resources of the API in the initial bundle, while the pages that use them are loaded on demand
export const HTTP_API_SERVER = new InjectionToken<string>('HttpApiServer');
