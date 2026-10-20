/**
 * The websocket API and the HTTP API run locally, without AWS (`npm run serve:local`): see local-api.ts
 */
import { getAllowedOrigins } from '@helpers/environment.helper';
import { LocalApi, startLocalApi } from './local-api';

// The only origins the APIs answer, as on AWS (ALLOWED_ORIGINS of the lambdas, CORS of the HTTP API): the game app in its
// local configuration (environment.local.ts) on port 4200, unless ALLOWED_ORIGINS gives others, separated by commas
// (ng serve --port). Read as the lambdas read it: a value giving none gives the default ones
try {
    getAllowedOrigins();
} catch {
    process.env.ALLOWED_ORIGINS = 'http://localhost:4200,http://127.0.0.1:4200';
}

// The websocket server and the HTTP API of the game app in its local configuration
const api: LocalApi = await startLocalApi({ port: 3001 });
console.log(`Websocket API listening on ${api.endpoint}`);
console.log(`HTTP API listening on ${api.httpEndpoint}`);
