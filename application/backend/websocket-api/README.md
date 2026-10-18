# Websocket Room API

## Build

`npm run build` bundles the lambdas with esbuild into `dist/` (`onconnect.mjs`, `ondisconnect.mjs`, `sendmessage.mjs`
of the websocket API, `httpapi.mjs` of the HTTP API, and `migrate/` with the migrations it applies), deployed by
Terraform. It refuses to bundle PGlite, the database of the local API and the specs.

## Database

The rooms, their players, queue and tokens, the password attempts and the connections live in PostgreSQL: on AWS an
Aurora Serverless v2 cluster (`modules/aws-aurora-serverless` of `infrastructure`), which the lambdas reach through its
Data API, over HTTPS, outside any VPC. The cluster pauses at 0 ACU 5 minutes after the last request, and costs nothing
but its storage and secret while nobody plays. A request to the paused cluster waits for it to resume, about 15
seconds (30 or more after a day): the Data API refuses it meanwhile, and the lambdas send it again
(`shared/database/resume-retry.ts`), 28 seconds at most, the timeout of the lambdas, under the 29 of API Gateway.

The schema is written with [Drizzle](https://orm.drizzle.team) (`shared/database/schema.ts`), the repositories query it
through its query builder and its relational queries (`shared/repositories`). `getDatabase()` builds the Data API client
from `DATABASE_RESOURCE_ARN`, `DATABASE_SECRET_ARN` and `DATABASE_NAME`, set by `infrastructure/main.tf`.

- `npm run db:generate` writes the migration of a change of the schema to `drizzle/` (`drizzle-kit generate`). Commit
  both: `npm run db:check`, run by the CI, fails on a schema without its migration.
- The `migrate` lambda applies the migrations the cluster misses, in one transaction, invoked by Terraform each time
  they change, before the other lambdas deploy.
- A conditional write tells whether it wrote from the rows it returns (`RETURNING`): the creation of a room, the
  reconnection of its host, the count of a password attempt.
- No TTL: the queries ignore the expired rooms, and the creation of a room deletes them, with their rows. No scheduled
  cleanup wakes the cluster.

`npm run smoke:data-api -- <stage>` runs the statements of the repositories on the cluster of a stage, with the AWS
credentials of the shell (`AWS_PROFILE`), in a database of their own, then waits for the cluster to pause and times a
statement sent to it: what the specs on PGlite do not check, the codecs of the Data API and a real concurrency.

## Development server

`npm run serve:local` runs the API locally, without AWS, on `ws://127.0.0.1:3001` and `http://127.0.0.1:3001`
(loopback only), and restarts it when a file changes. `local/local-api.ts` emulates API Gateway around the lambdas: the
websocket routes (`$connect`, `sendmessage`, `ping`, `$disconnect`), the `PostToConnection` endpoint of the management
API, and the HTTP API: any other request runs the `httpapi` lambda, which answers its routes (`GET /rooms`) and not
found to the others, preflights included (the app sends simple requests). Readable by the game app served on
`localhost` or `127.0.0.1`, on any port (`Access-Control-Allow-Origin`), its failures too.
The database is [PGlite](https://pglite.dev), PostgreSQL compiled to WASM, in memory, with the migrations of
`drizzle/`, and the major version of the cluster: the rooms are lost at each restart.

Then serve the game app against it, from `application/frontend/game-app`: `npm run serve:local`.

The websocket lambdas get the IP of the client, as from API Gateway. The events of the HTTP API carry their route key
and raw query string only.

Emulated limits: 32 KB per message received (one frame of API Gateway, where a browser sends each message
in a single frame), 128 KB per message posted to a connection, and the connections closed (1001) after
10 minutes without message in either direction, or after 2 hours. Not emulated: the authorization and the
throttling. The staging environment on AWS remains the reference.

The emulation is tested by `local/local-api.spec.ts`, run with the specs of the lambdas. The other specs run on
PGlite too, a database per spec file emptied before each test (`testing/database.ts`): the conditional writes are
evaluated by PostgreSQL in every spec.

## Host reconnection

API Gateway closes any connection after 2 hours, and the host keeps its connection open while it waits for the
players. Each page sends a secret token of its own with `create` and `join` (the room keeps its SHA-256 by player,
`tokenHashes`, kept once the player is removed: the same page joins a private room again without its password). Every 100 minutes, or as soon as its socket closes, the host opens a new
socket and sends it `reconnect` with its name and token: the room moves
to the new connection, then the former socket closes. When the host connection closes before, `$disconnect` keeps
the room for 10 minutes (`expiresAt`): joins are refused (`Host disconnected`) until the
host reconnects, and the room keeps its name until it expires. Meanwhile, a player of the room can take it over with
`reconnect` and its own name and token: the room moves to its connection, and it becomes the host (`Host connected`
while the former host connection is still open). The host declares again a player whose connection it restored:
`playerAdd` of a player already in the room changes nothing.

## Health

`GET /health` of the HTTP API answers `{ "status": "up" }` once the database answers a statement reading nothing
(`HealthRepository`): a paused cluster resumes meanwhile, 28 seconds at most, the timeout of the lambda, else 500. The
pages using the APIs wait for it before they show (the health guard of the game app, which asks it again until it
answers): their requests then reach a database awake, the websocket API sharing it.

## Open rooms

A page lists the rooms of its game (`game` of `create`: the chess rooms on the chess page, the chat rooms on the chat
page) over HTTPS, with `GET /rooms?game=<game>&search=<text>` of the HTTP API (`lambdas/httpapi`), without connection:
the websocket serves the connectivity of the rooms only, a page opens it to create or join one. The rooms which did not
expire, 30 at most, `hasMore` when more exist (a `RoomsResponse` in JSON). The full rooms and the ones waiting for their host (`hostConnected: false`) are listed too: a participant whose page reloaded
joins its room again from the list, the join retried until the room has its place back or its host reconnected.

- Without `search`, the 30 most recent rooms, the last created first. A page asks it again every 15 seconds.
- With a `search`, the rooms whose name holds it, whatever the case: the names starting with it first, then by name,
  the name equal to the search first. A page asks a search once typed, or on demand, not every 15 seconds.
- An unknown or missing game, a search longer than 64 characters or holding the NUL character, or a `game` or `search`
  given more than once: 400 `{ "message": "Payload not valid" }`, API Gateway joining the values of a repeated parameter
  with commas. The other parameters are ignored. A failure of the database: 500, without its message.

A query reads 31 rooms at most, the last one telling more exist, with the count of their players. A private room is
listed by `isPrivate`, never the hash of its password. The indexes of the `rooms` table:

| Index | Columns | Read by |
|---|---|---|
| `rooms_game_created_at` | `game`, `created_at` (the ISO date of the creation, sorted as a text) | the most recent rooms |
| `rooms_name_key_trgm` | `name_key`, the name in lower case (`search.helper`), by trigram (`pg_trgm`) | a search |
| `rooms_expires_at` | `expires_at`, of the rooms waiting for their host | the cleanup of the expired rooms |

The list refreshed every 15 seconds keeps the cluster awake while a page shows it.

The names of the rooms and of the players are 32 characters at most, not of spaces only, the passwords 6 to 128, the
searches 64, and a room has 16 players at most (`room-limits.ts` of the protocol): the API refuses longer ones.

`join` sends the `game` of the page: a room of another game is refused (`Room of another game`), its peers running other
messages. A room created with a `password` is private: listed with `isPrivate`, without the name of its host, `join` refuses it
without its password (`Wrong password`), before telling whether a name is in the room. The room keeps a salted scrypt hash of its password
(`passwordHash`), never the password, as long as the room exists: the player taking the room over keeps it private. A
page sends the game and the password again each time it joins the room again, but a page which joined the room before
does not need it: its token matches the hash the room keeps (`tokenHashes`). A page creates a token each time it creates
or joins a room: a page reloaded gives the password again. A host disconnected is told before the
password is checked, as the list of the rooms tells it: the joins retried while the host reconnects are not counted as
attempts.

A client gives 5 passwords in a row at most, then the room refuses its passwords for this client only (`Too many
password attempts`), without checking them, until a minute after the last one. A missing password, or one of a length
the room refuses, is never the right one: refused without being counted, a room listed as public before it became private
does not cost an attempt. Each other password is counted before being
checked, by one conditional upsert, so that the passwords sent all at once are not all checked. Its right password is
not counted once checked, the wrong ones before stay: a client guessing the password from the IP of a player keeps its
count. A password is not guessed by trying them all, the wrong ones do not run scrypt without end, and the other players
still join the room. A participant joining its room again, without leaving its page, is not locked by another client of its IP: its token spares it
the password.

The room tells the clients apart by their IP, given by API Gateway (`requestContext.identity.sourceIp`), or by their
connection without it: the API keeps a short HMAC of it (`source.helper`), keyed by a secret, never the IP. The attempts
are counted apart from the rooms, in the `room_password_attempts` table (`PasswordAttemptRepository` of
`RoomPasswordService`, by room and client), deleted with their room: a room created again under the name of an expired
one starts without the attempts of the former one. The row of a room, read by every request, does not grow with the
clients trying its password. The clients behind a same IP share their count. The lambdas reaching the cluster all read
every table: the Data API grants a cluster, not a table.

The key of the HMAC keeps the IP of a hash from being found by hashing the 2^32 IPv4 addresses in turn. It lives in the
SSM parameter `/sc/<stage>/source-hash-secret`, a `SecureString` of the AWS managed key `aws/ssm`: Terraform generates it
with an ephemeral `random_password` and writes it through a write-only argument (`value_wo`), so that neither the
Terraform plan and state nor the configuration of the lambda hold it. `sendmessage`, the only lambda hashing IPs, gets
the name of the parameter (`SOURCE_HASH_SECRET_PARAMETER`) and reads the key once, when it loads (a top-level `await` of
`source.helper`, which the cold start waits for): without it, the lambda fails to load, before any request. Its role,
`sc_lambda_sendmessage_<stage>`, reads that parameter only. The local server and the specs give the key directly, in
`SOURCE_HASH_SECRET`. Raising `source_hash_secret_version` (`infrastructure/main.tf`) writes a new key: only the counts
of a minute start again. `sendmessage` gets the version too (`SOURCE_HASH_SECRET_VERSION`), so that its configuration
changes and its warm lambdas, holding the former key, are replaced: a client would otherwise be counted apart by the
lambdas of each key, and give twice as many passwords.
