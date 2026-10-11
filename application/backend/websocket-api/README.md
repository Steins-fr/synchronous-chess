# Websocket Room API

## Build

`npm run build` bundles the three lambdas with esbuild into `dist/` (`onconnect.mjs`, `ondisconnect.mjs`,
`sendmessage.mjs`), deployed by Terraform.

## Development server

`npm run serve:local` runs the API locally, without AWS, on `ws://127.0.0.1:3001` (loopback only), and
restarts it when a file changes. `local/local-api.ts` emulates API Gateway around the lambdas: the websocket
routes (`$connect`, `sendmessage`, `ping`, `$disconnect`) and the `PostToConnection` endpoint of the management API.
DynamoDB is emulated by [dynalite](https://github.com/architect/dynalite), in memory: the rooms are lost at
each restart.

Then serve the game app against it, from `application/frontend/game-app`: `npm run serve:local`.

The lambdas get the IP of the client, as from API Gateway.

Emulated limits: 32 KB per message received (one frame of API Gateway, where a browser sends each message
in a single frame), 128 KB per message posted to a connection, and the connections closed (1001) after
10 minutes without message in either direction, or after 2 hours. Not emulated: the authorization and the
throttling. The staging environment on AWS remains the reference.

The emulation is tested by `local/local-api.spec.ts`, run with the specs of the lambdas. Through dynalite, it also
checks the condition expressions of the writes (the room creation and the reconnection of its host), which the
mocks of DynamoDB in the other specs do not evaluate.

## Host reconnection

API Gateway closes any connection after 2 hours, and the host keeps its connection open while it waits for the
players. Each page sends a secret token of its own with `create` and `join` (the room keeps its SHA-256 by player,
`tokenHashes`, until the player is removed). Every 100 minutes, or as soon as its socket closes, the host opens a new
socket and sends it `reconnect` with its name and token: the room moves
to the new connection, then the former socket closes. When the host connection closes before, `$disconnect` keeps
the room for 10 minutes (`expiresAt`, also the TTL of the table): joins are refused (`Host disconnected`) until the
host reconnects, and the room keeps its name until it expires. Meanwhile, a player of the room can take it over with
`reconnect` and its own name and token: the room moves to its connection, and it becomes the host (`Host connected`
while the former host connection is still open). The host declares again a player whose connection it restored:
`playerAdd` of a player already in the room changes nothing.

## Open rooms

A page lists the rooms of its game (`game` of `create`: the chess rooms on the chess page, the chat rooms on the chat
page) with `roomGetAll`, from any connection: the rooms which did not expire, 30 at most, `hasMore` when more exist. The
full rooms and the ones waiting for their host (`hostConnected: false`) are listed too: a participant whose page reloaded
joins its room again from the list, the join retried until the room has its place back or its host reconnected.

- Without `search`, the 30 most recent rooms, the last created first. A page asks it again every 15 seconds.
- With a `search`, the rooms whose name starts with it, whatever the case, by name: the name equal to the search
  first. A page asks a search once typed, or on demand, not every 15 seconds.

DynamoDB has no search within a text: the search is a prefix of a sort key (`begins_with`), so that DynamoDB reads the
matching rooms only. The rooms table has two secondary indexes by `game`, projecting what the list shows
(`LISTED_ROOM_ATTRIBUTES` of `RoomRepository`; the indexes of `infrastructure/main.tf`, and of `local/local-api.ts`):

| Index | Sort key | Read by |
|---|---|---|
| `game-index` | `createdAt`, the ISO date of the creation, sorted as a text | the most recent rooms |
| `game-name-index` | `nameKey`, the name of the room in lower case (`search.helper`) | a search |

A query reads the rooms it lists, page after page: 31 at most, the last one telling more exist. The expired rooms
stay in the indexes until the TTL deletes them, within a few days, dropped by the filter of the query after being read:
each page reads twice as many rooms as the one before, so that many expired rooms cost a few queries only. Each write of a room
updates its two indexes.

The names of the rooms and of the players are 32 characters at most, not of spaces only, the passwords 128, the
searches 64, and a room has 16 players at most (`room-limits.ts` of the protocol): the API refuses longer ones, the list
fits a message.

`join` sends the `game` of the page: a room of another game is refused (`Room of another game`), its peers running other
messages. A room created with a `password` is private: listed with `isPrivate`, `join` refuses it without its password
(`Wrong password`), before telling whether a name is in the room. The room keeps a salted scrypt hash of its password
(`passwordHash`), never the password, as long as the room exists: the player taking the room over keeps it private. A
page sends the game and the password again each time it joins the room again. A host disconnected is told before the
password is checked, as the list of the rooms tells it: the joins retried while the host reconnects are not counted as
attempts.

A client gives 5 passwords in a row at most, then the room refuses its passwords for this client only (`Too many
password attempts`), without checking them, until a minute after the last one: each password is counted before being
checked, by a conditional update, so that the passwords sent all at once are not all checked. Its right password
forgets its attempts before. A password is not guessed by trying them all, the wrong ones do not run scrypt without
end, and the other players still join the room. A participant joining its room again waits for the end of a lock caused
by another client of its IP, its password accepted before.

The room tells the clients apart by their IP, given by API Gateway (`requestContext.identity.sourceIp`), or by their
connection without it: the API keeps a short HMAC of it (`source.helper`), keyed by `SOURCE_HASH_SECRET` (a
`random_password` of Terraform), never the IP. The attempts are counted apart from the rooms, in the
`password-attempt` table (`PasswordAttemptRepository`, by room name and client): each room read by every request does
not grow with the clients trying its password, and the TTL of the table (`expiresAt`) deletes the counts over. The
clients behind a same IP share their count.
