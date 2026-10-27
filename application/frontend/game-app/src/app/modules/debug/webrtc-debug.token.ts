import { InjectionToken } from '@angular/core';

// Whether the pages of a room offer the debug panel of WebRTC (webrtcDebug of the environment): developer tooling, on
// the local and staging stages. In a file of its own, as HTTP_API_WITH_CREDENTIALS. Hidden unless provided
export const WEBRTC_DEBUG = new InjectionToken<boolean>('WebrtcDebug', {
    providedIn: 'root',
    factory: (): boolean => false,
});
