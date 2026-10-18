/**
 * The websocket API and the HTTP API run locally, without AWS (`npm run serve:local`): see local-api.ts
 */
import { LocalApi, startLocalApi } from './local-api';

// The websocket server and the HTTP API of the game app in its local configuration (environment.local.ts)
const api: LocalApi = await startLocalApi({ port: 3001 });
console.log(`Websocket API listening on ${api.endpoint}`);
console.log(`HTTP API listening on ${api.httpEndpoint}`);
