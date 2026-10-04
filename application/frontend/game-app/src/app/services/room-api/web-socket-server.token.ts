import { InjectionToken } from '@angular/core';

// The URL of the websocket API. In a file of its own: the config of the app provides it, and importing it from
// RoomSocketApi would put the socket client in the initial bundle, while the pages that use it are loaded on demand
export const WEB_SOCKET_SERVER = new InjectionToken<string>('WebSocketServer');
