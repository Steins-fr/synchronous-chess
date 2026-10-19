import { InjectionToken } from '@angular/core';

// Whether the requests to the HTTP API send the cookies of the browser (httpApiWithCredentials of the environment): the
// access cookies of a stage restricted to its owner. In a file of its own, as HTTP_API_SERVER. None sent unless provided
export const HTTP_API_WITH_CREDENTIALS = new InjectionToken<boolean>('HttpApiWithCredentials', {
    providedIn: 'root',
    factory: (): boolean => false,
});
