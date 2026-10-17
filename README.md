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

The backend is designed to run on AWS lambda (lambda functions/layers).

**Language**: Typescript.

#### Room Manager Layer

Layer that helps lambdas for managing the rooms. It exposes two services:

**Room service**: Manage the room (create/update/remove).

**Connection service**: Manage the websocket connections and links connections to a room. That permits to identify the room for connection id. Used for removing a player from the room queue or detect room host disconnection.

#### Websocket API Lambdas

**Required**: Room Manager Layer.

The API is composed of 3 lambdas for managing websocket connection, disconnection and messages, and a 4th applying the migrations of the database on deploy. The disconnection and message lambdas use the *room manager layer* and the *PostgreSQL database* (Aurora Serverless v2, through its Data API).

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


### **Frontend**
---

The synchronous chess board game with chat. 

The players exchange their moves and chat messages directly over WebRTC, through block chains ordered by the host,
which the other participants watch for cheats. The moves stay hidden until both players are committed.
See [Block chains and anti-cheat](documentation/blockchain-and-anti-cheat.md) and
[Chess game session](documentation/chess-game-session.md).

**Required**: Backend Websocket API.

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
 - S3: Stores the frontend files and their access logs;
 - CloudFront: Serves the frontend from S3 and manage the cache;
 - Lambda: Run the Room API designed for Websocket;
 - API Gateway: Manages Websocket connection and API calls, then transmits calls to the lambdas;
 - Aurora Serverless v2 (PostgreSQL): Stores the Rooms informations for the API, reached by the lambdas through its Data API;
 - Route 53: Manage the DNS records;
 - CloudWatch: Monitors and logs;
 - ACM: Manage the certificates.

 A data-source is used for the certificate from AWS Certificate Manager. I prefer creating manually the certificate, its more easier. 

 The API Gateway is not provisioned by Terraform because the AWS provider do not permits Websocket API creation. 

#### Terraform init backend configuration

Important: Terraform states are stored in a S3 bucket.

The Terraform backend configuration variables:
- bucket: S3 bucket where is stored the terraform states;
- key: Bucket path of the terraform states;
- region: AWS region.

#### Terraform plan vars

- stage: Stage name. Ex: 'dev';
- acm_certificate_arn: AWS arn of the certificate that CloudFront have to serve.
- main_domain_name: Domain name principal. As example, 'steins.fr'

The app will be deployed by adding automatically sub-domains.
- frontend: sc-{stage}.{main_domain_name};
- backend: Currently managed manually.

## **CI/CD**

This project started with the new CI/CD GitHub solution named GitHub Actions then migrated to CircleCI. GitHub Actions is good but miss a lot of features like:
- Manual trigger;
- Docker image caching when pulling images;
- Save dependencies in cache to avoid installing them in each jobs;
- Control on the volume work directory mount path when using Docker images.

### CircleCI jobs

```
Frontend Lint --\                 HOLD - manual trigger
                 \                          \
Frontend Test ----|--|- TF init -- TF plan --|-- TF apply
                 /  /
Frontend Build -/  /
                  /
Backend Build----/
```
To improve:
- Add Backend Test
- Add Frontend sonarscan
- Add Backend lint & sonarscan

### Github Actions jobs

It was impossible to achieve a working sonarscan on CircleCI. 
It detected CircleCI auto-configuration but throw error that the pull request ID was not provided. Same if it was given as option.

```
Frontend Test ----- SonarQube scan
```

## QA - SonarCloud

[Frontend Dashboard](https://sonarcloud.io/dashboard?id=Steins-fr_synchronous-chess)
