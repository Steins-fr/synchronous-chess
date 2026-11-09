# **Synchronous Chess**

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Steins-fr_synchronous-chess&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Steins-fr_synchronous-chess) [![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Steins-fr_synchronous-chess&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Steins-fr_synchronous-chess) [![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=Steins-fr_synchronous-chess&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=Steins-fr_synchronous-chess) [![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=Steins-fr_synchronous-chess&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=Steins-fr_synchronous-chess) [![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Steins-fr_synchronous-chess&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=Steins-fr_synchronous-chess)

This project is an online chess board game. It implements the chess variant called `Synchronous chess`. For more detail about the rules, see [this website](http://www.hexenspiel.de/engl/synchronous-chess/) 

## **In progress - demo**

The app is currently in development. Its testing version, https://sc-staging.steins.fr, answers its owner only
([Access to staging](#access-to-staging)).

The website follows the language of the browser, and its menu switches it, also during a game.

In the demo, you can choose either to create a room or join an existing one. 

The room creator is the host, if he leave the room, the participants can continue to interact but no-one can join anymore.

### Synchronous Chess demo

Each participant, the host included, takes the free seat below the board with `Play white`, or `Play black` once white is taken: the board shows from the side of the local player. The seats are final once the first move is played; the others are spectators.

Drag & Drop a piece to validate a move. The registered move will be displayed with two green cells: the origin and the destination. When both players has played, both moves will be played.

For the Synchronous Chess rules, please refer to [this website](http://www.hexenspiel.de/engl/synchronous-chess/).

### Seventeen Poker demo

The poker of the manga *Liar Game*, for two players: 17 cards (the aces, kings, queens and jacks, and a joker), 10 hands, 150 chips each. Each player takes a seat with `Sit here`, then the players deal the hands by turns with `Deal`, the dealer's page dealing by itself once its time is over from the second hand. The others watch. Once the match is over, its players start a new one with `Play again`, or leave their seats to the others.

No one deals the cards: the players shuffle each deck together, encrypted, and give each other the keys of the cards dealt, so no one, not even the server, sees a hand before its showdown. Once the match is over, every key is shown and each participant checks every deck. See [Mental poker](documentation/mental-poker.md) and [Seventeen Poker session](documentation/seventeen-poker-session.md).

### Russian Roulette demo

The 24-shot Russian roulette of the manga *Liar Game*, for two players: a revolver of 24 chambers, 3 bullets loaded by each player in the chambers of its choice, 150 chips each. Each player takes a seat with `Sit here`, picks its chambers and clicks `Load`. In turn, a player shoots to take the chips on the table, or passes by paying, the price doubling at each pass in a row, the 5th one in a row revealing the next chamber; a bullet is a death, which costs 50 chips, and a death leaving a player without chips makes it bankrupt: it loses the game at once. Else, once the 6 bullets fired, the fewest deaths win. The others watch, and the players start a new game with `Play again`.

No one knows the cylinder: each chamber is encrypted with the keys of both players, and each player spins it in turn, so a shot only tells how many bullets the chamber held, never whose they were, and no one, not even the server, knows which chamber comes next. Once the game is over, both keys are shown and each participant checks the spins. See [Russian roulette session](documentation/russian-roulette-session.md).

### Bid Poker demo

The poker of the manga *Liar Game* for 4 to 8 players, bought at auction: 300 coins each, the 52 cards cut into public lots. Each player takes a seat with `Sit here`, then one of them clicks `Start the game`. Every player bids on each lot at the same time, sealed, with `Bid` or `No bid`; then, during 5 change sessions, each player may discard cards, sold to the others the same way. At the end, the last ones are the pigs: they pay the prizes of the first three. The others watch, and a seated player starts a new game with `Play again`.

No one reads a bid before the auction of its lot closes, not even the server: each page sends the hash of its bid, then reveals it once every player bid. No one shuffles the deck alone: each player gives a sealed random part. See [Bid Poker session](documentation/bid-poker-session.md).

### Minority Game demo

The Minority Game of the manga *Liar Game* for 3 to 8 players: a player drawn asks a question answered by yes or no, every player votes, sealed, and the majority loses. Each player takes a seat with `Sit here`, then one of them picks the variant and the time of a vote and clicks `Start the game`. In the elimination variant, the majority is eliminated down to the last 1 or 2 players, who share the stakes; in the score variant, nobody is eliminated and each player of the minority scores the votes of the majority, over 10 rounds. The chat is where alliances are made, and betrayed.

No one reads a vote before every player voted, not even the server: each page sends the hash of its vote, then reveals it once every player voted. No one picks the askers: they are drawn from a sealed random part of each player. See [Minority Game session](documentation/minority-game-session.md).

### Contraband demo

The Contraband of the manga *Liar Game*: two countries of 1 to 4 players, the North and the South, smuggle their money across the customs of the other one. Each player starts with 300 million in an ATM of its country and 100 million on an account in a third country, and owes 400 million at the end. Each participant takes a seat of a country with `Sit here`, then one of them picks the variant, the time of the customs and the number of games, and clicks `Start the game` once both countries hold as many players. In each game, a smuggler packs a trunk, sealed, and an inspector of the other country calls: in the Classic variant, a trunk holds up to 100 million, and the inspector passes it or doubts an amount, seizing the trunk when it doubted enough, else paying half of its doubt; in the Gold Rush, a trunk holds a gold bar or an iron bar, and the inspector passes it or checks it. At the end, the money left in the ATMs of a country goes to the other one, and the richer country wins. Each country plots in a private conversation, and each smuggler talks with its inspector at the customs, encrypted: the other participants, the server included, never read them.

No one reads a trunk before the call, not even the server: the page of the smuggler sends the hash of its trunk, then reveals it once the inspector called, and a trunk withheld is seized at the most it could hold. No one picks the pairs: they are drawn from a sealed random part of each player. See [Contraband session](documentation/contraband-session.md).

### Garden of Eden demo

The Garden of Eden of the film *Liar Game: The Final Stage* for 3 to 8 players: 13 rounds, in each one every player picks an apple, sealed, gold, silver or red. When every apple is red, every player wins 100 million; a lone red apple among gold or silver ones loses 1,000 million, its player named, and a lone gold or silver apple among 2 red ones or more wins 200 million. Each player takes a seat with `Sit here`, then one of them picks the time of a vote and the starting money, and clicks `Start the game`. A player at −500 million or below loses paradise, for good. The game ends after the 13 rounds, or once fewer than 2 players are still in: the richest player still in wins. The chat is where trust is built, and betrayed.

No one reads an apple before every player picked one, not even the server: each page sends the hash of its apple, then reveals it once every player picked one, and an apple withheld loses as much as a lone red apple. See [Garden of Eden session](documentation/garden-of-eden-session.md).

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

The API is composed of 4 lambdas for managing websocket connection, disconnection, messages and pings, a 5th serving the routes of the HTTP API, a 6th applying the migrations of the database on deploy, and, on production, one keeping the database out of its deep sleep. The websocket serves the connectivity of the rooms only (create, join, reconnect, the players, the WebRTC signals and the notifications of the room), everything else goes through HTTPS. The disconnection, message, ping and HTTP API lambdas use the services and the *PostgreSQL database* (Aurora Serverless v2, through its Data API).

**onconnect** - Open the websocket connections of the pages of the app only (their Origin): API Gateway refuses the others, without `$disconnect`, whose statement would wake the paused database.

**ondisconnect** - Handle websocket disconnection. It will remove a player from a room queue, or let the room wait 10 minutes for its host to reconnect if the host was disconnected.

**ping** - The host of a room sends `{"message":"ping"}` every 3 minutes on its open socket, as API Gateway closes a connection without message for 10 minutes. Its lambda renews the lease of the room, which ends 20 minutes without ping: a statement, so the database, which pauses 5 minutes after the last one, stays awake during a game, the disconnection of the host always seen. Answered by nothing.

**sendmessage** - Handle all the websocket exchanges separated in host and peer roles. Available messages:
 - **create** - Create a new room if the room name is available (or its room expired), with a secret token of the host;
 - **reconnect** - Move the room to the connection sending it, with the name and token of the player: the host, before API Gateway closes its connection (2 hours at most) or once it closed, or a player of the room taking it over while the room waits for its host (refused with `Host connected` before), which becomes the host;
 - **add player** - only host - Add a new player to the room player list;
 - **remove player** - only host - Remove a player from the room player list, keeping the hash of its token: its page joins a private room again without its password;
 - **get players** - only host - Get the room player list
 - **signal to peer** - only host - Send the RTC signal to a specific peer waiting in the room queue;
 - **join** - Ask to join a room and add the player in the room queue, with a secret token of the player;
 - **signal to host** - only peer - Send the RTC signal to the room host. The peer have to be in the waiting queue.

**httpapi** - Behind the HTTP API, a handler per route, selected by its method and path, answering the pages of the app only (their Origin). Available routes:
 - **`GET /rooms?game=<game>&search=<text>`** - The open rooms of a game, without connection: the most recent first, or the ones whose name holds the search. A page asks them once a person is on it, never for a bot rendering it.

**wakedatabase** - Production only, invoked every 6 hours by EventBridge: wakes the database, unless it ran within the 8 last hours (its capacity in CloudWatch). After 24 hours paused, Aurora puts it into a deeper sleep, whose resume outlasts the retries of the other lambdas.


### **Frontend**
---

The synchronous chess board game, the Seventeen Poker, the 24-shot Russian roulette, the Bid Poker, the Minority Game, the Contraband and the Garden of Eden, with chat.

The players exchange their moves and chat messages directly over WebRTC, through block chains ordered by the host,
which the other participants watch for cheats. The moves stay hidden until both players are committed, the
cards of the poker until their showdown, the bullets of the roulette until their chamber fires, the bids of the Bid
Poker until their auction closes, the votes of the Minority Game until every player voted, the trunks of the
Contraband until their inspector called, and the apples of the Garden of Eden until every player picked one; the
private conversations of the Contraband are encrypted end to end.
See [Block chains and anti-cheat](documentation/blockchain-and-anti-cheat.md),
[Chess game session](documentation/chess-game-session.md), [Mental poker](documentation/mental-poker.md),
[Seventeen Poker session](documentation/seventeen-poker-session.md),
[Russian roulette session](documentation/russian-roulette-session.md),
[Bid Poker session](documentation/bid-poker-session.md),
[Minority Game session](documentation/minority-game-session.md),
[Contraband session](documentation/contraband-session.md) and
[Garden of Eden session](documentation/garden-of-eden-session.md).

**Required**: Backend API (its websocket API and its HTTP API).

**Technology**: Angular 17+.

**Language**: Typescript.

### **Databases**
---

A PostgreSQL database: Aurora Serverless v2 on AWS, paused when nobody plays, PGlite in memory locally and in the specs.
The schema is written with Drizzle in `application/backend/websocket-api/shared/database/schema.ts`, its migrations in
`drizzle/` (see the [README of the API](application/backend/websocket-api/README.md#database)).

#### Rooms

- id: Id of the room: its name and the 6-digit tag the API draws at its creation (`friday#451203`), unique across the games;
- connection_id: Websocket connection id of the host;
- host_player: Player name of the host;
- max_player: Maximum of player that can join the room;
- game: The game of the room, chess, seventeen-poker, russian-roulette, bid-poker, minority-game, contraband, garden-of-eden or chat;
- created_at, name_key: The date of its creation and its id in lower case, to list and search the rooms, unique: the ids differ whatever their case;
- password_hash, is_private: The salted hash of the password of a private room;
- expires_at: Set while the host is disconnected, in epoch seconds: the room no longer exists after it, and the creation of a room deletes it.
- lease_until: While the host is connected, in epoch seconds: the room no longer exists after it, unless a ping of the host renews it.

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
 - CloudFront: Serves the frontend from S3 and manage the cache, on staging to the signed cookies of its owner only;
 - Lambda: Run the Room API, behind the WebSocket API and the HTTP API, and on staging the login of its owner and the authorizers of both APIs;
 - Cognito: The login of the owner of staging (managed login), the one user of its pool, which the bootstrap keeps;
 - API Gateway: Manages the Websocket connections and messages (the connectivity of the rooms), and the HTTPS requests of the HTTP API (the list of the rooms), then transmits them to the lambdas;
 - Aurora Serverless v2 (PostgreSQL): Stores the Rooms informations for the API, reached by the lambdas through its Data API;
 - Secrets Manager: Keeps the password of the database, which the Data API reads;
 - Systems Manager Parameter Store: Keeps the key of the hashes of the IPs of the clients, out of the Terraform state, which the sendmessage lambda reads, and on staging the key signing the access cookies, which its owner writes;
 - Route 53: Manage the DNS records;
 - CloudWatch: Monitors and logs;
 - ACM: Manage the certificates.

Terraform provisions every resource but the Route 53 zone of the main domain, which must exist: it reads it, then adds
the DNS records of the app, of the websocket API, of the HTTP API, and the ones validating their ACM certificates.

#### Terraform init backend configuration

Important: Terraform states are stored in a S3 bucket, `synchronous-chess-terraform`.

The Terraform backend configuration variables:
- bucket: S3 bucket where is stored the terraform states;
- key: Bucket path of the terraform states: `<stage>/terraform.tfstate` for each stage, `bootstrap/terraform.tfstate`
  for `infrastructure/bootstrap`;
- region: AWS region.

A plan or an apply locks the state with a `<key>.tflock` object beside it (`use_lockfile`): a run of the CI and one of a
workstation never write the same state at once.

#### Terraform plan vars

- stage: Stage name: `production` or `staging`;
- main_domain_name: Domain name principal. As example, 'steins.fr'
- access_public_key: The public key of the access cookies of staging, `ACCESS_PUBLIC_KEY` of its GitHub environment:
  required on staging, refused on the other stages, which stay public ([Access to staging](#access-to-staging)).

The app will be deployed by adding automatically sub-domains, which its environment of the stage targets
(`application/frontend/game-app/src/environments`).
- frontend: sc-{stage}.{main_domain_name};
- backend: sc-ws-{stage}.{main_domain_name}, the websocket API;
- backend: sc-api-{stage}.{main_domain_name}, the HTTP API, a domain of its own: API Gateway does not map a websocket
  API and an HTTP API to the same domain. Readable by the pages of its stage only (CORS), with their cookies on staging
  (its access cookies).

The lambdas and the app are built before the plan: `npm run build` in `application/backend/websocket-api`, and
`npm run build -- --configuration=<stage>` in `application/frontend/game-app` (`dist/game-app/browser`).

#### Deployment

**Once per account**, before any stage: [`infrastructure/bootstrap`](infrastructure/bootstrap/README.md).

It is applied locally with an admin profile, and creates:
- the trust of AWS in GitHub Actions, and the deploy role of each stage;
- the boundaries of the roles of the lambdas, and the account of API Gateway;
- then the GitHub environments, their secrets and the repository variables are set from it.

**From the CI**, for `staging` and `production`:
1. Run Terraform Plan (Actions), from a branch for staging, from `main` for production, with the stage. A production
   plan waits for the approval of its environment.
2. Note the Run ID in its summary, and read the plan there.
3. Run Terraform Apply with that Run ID and the same stage. A production apply waits for an approval again, then checks
   that the plan was made from a commit of `main`.

To destroy a stage, tick `destroy` in steps 1 and 3: the plan removes every resource of the stage, which its summary
lists, and Terraform Apply applies it the same way. Their runs are named `Terraform Plan <stage> (destroy)` and
`Terraform Apply <stage> (destroy)`, and an apply refuses a plan whose `destroy` differs from its own.
- The bootstrap and the empty state of the stage remain: a plan without `destroy` deploys it again.
- So does the execution log group of its WebSocket API, `/aws/apigateway/<api id>/<Stage>`, which API Gateway creates
  outside the state and keeps forever: delete it with the admin profile.

A plan is refused once the state has changed since, and its artifacts expire after 7 days: plan again. The artifacts and
summaries of the runs are public: the state and the plan never hold a secret.

After the first apply of a stage:
- its WebSocket domain takes a few minutes to answer, the time its API mapping spreads;
- the next plan replaces the deployment of the WebSocket API once: the routes and integrations read back empty
  attributes the state did not hold yet, which change the hash of the deployment. Apply it, then a plan shows no change.

**Locally**, for any stage, with the admin profile:

```bash
aws sso login --profile admin && export AWS_PROFILE=admin
(cd application/backend/websocket-api && npm ci && npm run build)
(cd application/frontend/game-app && npm ci && npm run build -- --configuration=<stage>)
cd infrastructure
terraform init -reconfigure -backend-config="bucket=synchronous-chess-terraform" -backend-config="key=<stage>/terraform.tfstate"
terraform plan -var="stage=<stage>" -var="main_domain_name=steins.fr" -out=tfplan
terraform apply tfplan
```

- A staging plan takes the public key of its access cookies:
  `export TF_VAR_access_public_key="$(gh variable get ACCESS_PUBLIC_KEY --env staging)"`.
- To destroy the stage, plan with `-destroy`: `terraform plan -destroy -var="stage=<stage>" ... -out=tfplan`. The lambdas
  are built first all the same, their archives being read by the plan.
- Terraform 1.16 is required, from 1.16.4 (the CI runs 1.16.4).
- `-reconfigure` keeps the state of another stage from being migrated when the stage changes in the same folder.
- The lock is shared with the CI. Use `terraform force-unlock <ID>` only after a run that died.

#### Access to staging

Staging answers its owner only, production stays public. The owner signs in on the managed login of Cognito, then the
three entry points of the stage check the same signed cookies of CloudFront:
- the front: CloudFront refuses a request without them (`trusted_key_groups` of its distribution) with a page sending
  to the login, still a 403: `access-denied.html`, served without the cookies;
- the WebSocket API: the authorizer of `$connect` (`wsauthorizer`) refuses the handshake, 401 without any cookie, 403
  without these ones;
- the HTTP API: its authorizer (`httpauthorizer`) refuses its routes without them (403). `/auth/login` and
  `/auth/callback` stay open: the `access` lambda runs the login there.

The login is the authorization code flow of Cognito with PKCE, its app client without secret: `/auth/login` sends to the
managed login, which sends the code back to `/auth/callback`, which exchanges it, then sets the cookies
(`CloudFront-Policy`, `CloudFront-Signature`, `CloudFront-Key-Pair-Id`, `CloudFront-Hash-Algorithm`) on `steins.fr` for
7 days, `HttpOnly`. The browser sends them to the front and to both APIs, of the same site, the app sending them to the
HTTP API (`httpApiWithCredentials` of its staging environment). They also reach the other hosts of `steins.fr`,
production included, which ignore them. Neither the cookies nor the tokens of Cognito are logged, nor kept.

The cookies are signed with an RSA key of the owner, never in the state, the plan nor the repository:
- its private key in the SSM parameter `/sc/staging/access-signing-key`, a SecureString outside Terraform, which the
  `access` lambda alone reads, and the deploy role of staging is denied;
- its public key in the GitHub variable `ACCESS_PUBLIC_KEY` of the staging environment, which the plan gives to
  CloudFront and to the authorizers (`access_public_key`).

**Once**, after the bootstrap is applied (it adds the user pool of staging and the `access` policy of its deploy
role), with the admin profile, in a temporary folder outside the repository: the private key goes to SSM, the public
key straight to GitHub.

```bash
cd "$(mktemp -d)" && umask 077
openssl genrsa -out key.pem 2048
aws ssm put-parameter --region eu-west-1 --name /sc/staging/access-signing-key --type SecureString --value file://key.pem \
  --tags Key=Application,Value="Synchronous chess" Key=Environment,Value=staging
openssl rsa -in key.pem -pubout | gh variable set ACCESS_PUBLIC_KEY --env staging --repo Steins-fr/synchronous-chess
shred -u key.pem
```

Outside the repository, `gh` needs `--repo`. The public key is derived again from the parameter, the private key never
shown:
`aws ssm get-parameter --region eu-west-1 --name /sc/staging/access-signing-key --with-decryption --query Parameter.Value --output text | openssl rsa -pubout | gh variable set ACCESS_PUBLIC_KEY --env staging --repo Steins-fr/synchronous-chess`.

Its user pool, `sc-access-staging`, belongs to the bootstrap (`terraform output access_user_pool_ids`), and only takes
the users an admin creates: create the owner once, whom Cognito emails a temporary password. It outlives the destruction
of staging.

```bash
pool=$(aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?Name=='sc-access-staging'].Id" --output text)
aws cognito-idp admin-create-user --user-pool-id "$pool" --username <email> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true
```

Then plan and apply staging, whenever needed.

**On each device**, a phone included: open https://sc-staging.steins.fr, which sends to the login
(https://sc-api-staging.steins.fr/auth/login), and sign in, which sends back to the front. The first time, with the
temporary password, then a new password and an authenticator app, whose code is asked at each login. Sign in again once
the cookies expired, after 7 days.

**To rotate the key**, which signs every device out: the same commands, with `--overwrite` instead of `--tags`, then plan
and apply staging. The key of SSM and the variable change together: the `access` lambda refuses to load while they
differ. A destroyed staging keeps the parameter, outside Terraform, and its user pool, in the bootstrap: its owner signs
in again once it is deployed again.

## **CI/CD**

GitHub Actions, in `.github/workflows`:
- `application-pull-request.yml`, on the pull requests changing `application/**`: the lint, type check and tests with
  coverage of the game app and of the websocket API (`application-ci.yml`), then one SonarCloud scan of both;
- `application-main.yml`, on `main`: the same without the lint, for the badges;
- `terraform-plan.yml`, run by hand for a stage: builds the lambdas and the app, plans the infrastructure, and keeps
  the plan with the builds;
- `terraform-apply.yml`, run by hand with the run of a plan: checks the plan run, then applies it from its commit.

The Terraform workflows:
- run in the GitHub environment of their stage: `staging` from any branch, `production` from `main` with an approval;
- assume the deploy role of that stage through OIDC, from the secret `AWS_ROLE_ARN` of the environment;
- read the bucket of the states in `vars.TF_STATE_BUCKET`, the domain in `vars.MAIN_DOMAIN_NAME`, and the public key of
  the access cookies of staging in `vars.ACCESS_PUBLIC_KEY` of its environment;
- pin the Terraform version, which a saved plan is applied with.

## QA - SonarCloud

[Frontend Dashboard](https://sonarcloud.io/dashboard?id=Steins-fr_synchronous-chess)
