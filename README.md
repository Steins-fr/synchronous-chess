# **Synchronous Chess**

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Steins-fr_synchronous-chess&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Steins-fr_synchronous-chess) [![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Steins-fr_synchronous-chess&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Steins-fr_synchronous-chess) [![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=Steins-fr_synchronous-chess&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=Steins-fr_synchronous-chess) [![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=Steins-fr_synchronous-chess&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=Steins-fr_synchronous-chess) [![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Steins-fr_synchronous-chess&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=Steins-fr_synchronous-chess)

This project is an online chess board game. It implements the chess variant called `Synchronous chess`. For more detail about the rules, see [this website](http://www.hexenspiel.de/engl/synchronous-chess/) 

## **In progress - demo**

The app is currently in development. It is possible to try it out the testing version at https://sc-staging.steins.fr

**Important: The website is only in French for the moment!**

In the demo, you can choose either to create a room or join an existing one. 

The room creator is the host, if he leave the room, the participants can continue to interact but no-one can join anymore.

### Synchronous Chess demo

Each participant, the host included, takes a free seat with the `Jouer les blancs` / `Jouer les noirs` buttons. The seats are final once the first move is played; the others are spectators.

Drag & Drop a piece to validate a move. The registered move will be displayed with two green cells: the origin and the destination. When both players has played, both moves will be played.

For the Synchronous Chess rules, please refer to [this website](http://www.hexenspiel.de/engl/synchronous-chess/).

### Chat demo

A simple chat demo with ping displayed between peers. For the moment, you have to click on the send button for sending the message. The `Enter` key is not supported.
The displayed errors are generics, this need some more works.

## **Application**

### **Backend**
---

The backend is designed to run on AWS Lambda, in `application/backend/websocket-api` (see its [README](application/backend/websocket-api/README.md)).

**Language**: Typescript.

#### Services

The code the lambdas share, in `shared/`, bundled into each lambda by esbuild:

**Room service**: Manage the room (create/update/remove).

**Connection service**: Manage the websocket connections and links connections to a room. That permits to identify the room for connection id. Used for removing a player from the room queue or detect room host disconnection.

#### API Lambdas

The API is composed of 3 lambdas for managing websocket connection, disconnection and messages, a 4th serving the routes of the HTTP API, and a 5th applying the migrations of the database on deploy. The websocket serves the connectivity of the rooms only (create, join, reconnect, the players, the WebRTC signals and the notifications of the room), everything else goes through HTTPS. The disconnection, message and HTTP API lambdas use the services and the *PostgreSQL database* (Aurora Serverless v2, through its Data API).

**onconnect** - Handle and log new websocket opened connection.

**ondisconnect** - Handle websocket disconnection. It will remove a player from a room queue, or let the room wait 10 minutes for its host to reconnect if the host was disconnected.

**ping** - A route with a mock integration, no lambda: the clients send `{"message":"ping"}` every 5 minutes on an open socket, as API Gateway closes a connection without message for 10 minutes.

**sendmessage** - Handle all the websocket exchanges separated in host and peer roles. Available messages:
 - **create** - Create a new room if the room name is available (or its room expired), with a secret token of the host;
 - **reconnect** - Move the room to the connection sending it, with the name and token of the player: the host, before API Gateway closes its connection (2 hours at most) or once it closed, or a player of the room taking it over while the room waits for its host (refused with `Host connected` before), which becomes the host;
 - **add player** - only host - Add a new player to the room player list;
 - **remove player** - only host - Remove a player from the room player list, keeping the hash of its token: its page joins a private room again without its password;
 - **get players** - only host - Get the room player list
 - **signal to peer** - only host - Send the RTC signal to a specific peer waiting in the room queue;
 - **join** - Ask to join a room and add the player in the room queue, with a secret token of the player;
 - **signal to host** - only peer - Send the RTC signal to the room host. The peer have to be in the waiting queue.

**httpapi** - Behind the HTTP API, a handler per route, selected by its method and path. Available routes:
 - **`GET /rooms?game=<game>&search=<text>`** - The open rooms of a game, without connection: the most recent first, or the ones whose name holds the search.


### **Frontend**
---

The synchronous chess board game with chat. 

The players exchange their moves and chat messages directly over WebRTC, through block chains ordered by the host,
which the other participants watch for cheats. The moves stay hidden until both players are committed.
See [Block chains and anti-cheat](documentation/blockchain-and-anti-cheat.md) and
[Chess game session](documentation/chess-game-session.md).

**Required**: Backend API (its websocket API and its HTTP API).

**Technology**: Angular 17+.

**Language**: Typescript.

### **Databases**
---

A PostgreSQL database: Aurora Serverless v2 on AWS, paused when nobody plays, PGlite in memory locally and in the specs.
The schema is written with Drizzle in `application/backend/websocket-api/shared/database/schema.ts`, its migrations in
`drizzle/` (see the [README of the API](application/backend/websocket-api/README.md#database)).

#### Rooms

- id: Id of the room also the room name;
- connection_id: Websocket connection id of the host;
- host_player: Player name of the host;
- max_player: Maximum of player that can join the room;
- game: The game of the room, chess or chat;
- created_at, name_key: The date of its creation and its name in lower case, to list and search the rooms;
- password_hash, is_private: The salted hash of the password of a private room;
- expires_at: Set while the host is disconnected, in epoch seconds: the room no longer exists after it, and the creation of a room deletes it.

Deleted with their room:
- room_players: The players currently in the room, in the order they joined;
- room_queue: The joining players, with their connection;
- room_tokens: SHA-256 of the token of each player, by name, sent with create or join: the host reconnects the room with its own;
- room_password_attempts: The passwords each client gave a private room in a row.

#### Connections

A relation table: given a connectionId, we can found the room ID in which the player is participating.

- connection_id: Websocket connection id of a peer or host;
- room_name: Room ID.

## **Infrastructure**

The project is hosted on Amazon Web Services and uses Terraform to provision and manage the cloud infrastructure.

![AWS diagram](documentation/resources/Synchronous-Chess-AWS-simple.svg)

The options of each service, the regions, the network of the database and the roles of the lambdas:
[detailed diagram](documentation/resources/Synchronous-Chess-AWS.svg).

#### Services:
 - S3: Stores the frontend files, and the Terraform states;
 - CloudFront: Serves the frontend from S3 and manage the cache;
 - Lambda: Run the Room API, behind the WebSocket API and the HTTP API;
 - API Gateway: Manages the Websocket connections and messages (the connectivity of the rooms), and the HTTPS requests of the HTTP API (the list of the rooms), then transmits them to the lambdas;
 - Aurora Serverless v2 (PostgreSQL): Stores the Rooms informations for the API, reached by the lambdas through its Data API;
 - Secrets Manager: Keeps the password of the database, which the Data API reads;
 - Route 53: Manage the DNS records;
 - CloudWatch: Monitors and logs;
 - ACM: Manage the certificates.

Terraform provisions every resource but the Route 53 zone of the main domain, which must exist: it reads it, then adds
the DNS records of the app, of the websocket API, of the HTTP API, and the ones validating their ACM certificates.

#### Terraform init backend configuration

Important: Terraform states are stored in a S3 bucket.

The Terraform backend configuration variables:
- bucket: S3 bucket where is stored the terraform states;
- key: Bucket path of the terraform states;
- region: AWS region.

#### Terraform plan vars

- stage: Stage name: `production`, `staging` or `development`;
- main_domain_name: Domain name principal. As example, 'steins.fr'

The app will be deployed by adding automatically sub-domains, which its environment of the stage targets
(`application/frontend/game-app/src/environments`).
- frontend: sc-{stage}.{main_domain_name};
- backend: sc-ws-{stage}.{main_domain_name}, the websocket API;
- backend: sc-api-{stage}.{main_domain_name}, the HTTP API, a domain of its own: API Gateway does not map a websocket
  API and an HTTP API to the same domain. Readable by the pages of its stage only (CORS), and by `http://localhost:4200`
  on the development stage, for `npm run serve:dev` of the game app.

The lambdas and the app are built before the plan: `npm run build` in `application/backend/websocket-api`, and
`npm run build -- --configuration=<stage>` in `application/frontend/game-app` (`dist/game-app/browser`).

## **CI/CD**

GitHub Actions, in `.github/workflows`:
- `application-pull-request.yml`, on the pull requests changing `application/**`: the lint, type check and tests with
  coverage of the game app and of the websocket API (`application-ci.yml`), then one SonarCloud scan of both;
- `application-main.yml`, on `main`: the same without the lint, for the badges;
- `terraform-plan.yml`, run by hand for a stage: builds the lambdas and the app, plans the infrastructure, and keeps
  the plan with the builds;
- `terraform-apply.yml`, run by hand with the run of a plan: applies it.

The Terraform workflows assume an AWS role through OIDC (`secrets.AWS_ROLE_ARN`), and read the bucket of the states in
`vars.TF_STATE_BUCKET`.

## QA - SonarCloud

[Frontend Dashboard](https://sonarcloud.io/dashboard?id=Steins-fr_synchronous-chess)
