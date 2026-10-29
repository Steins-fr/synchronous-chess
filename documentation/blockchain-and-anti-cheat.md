# Block chains and anti-cheat

The players of a room talk directly to each other over WebRTC, without a game server. Every chess move
and chat message goes through a **block chain**, so that all the participants receive the same
messages in the same order and can check who wrote them. An **anti-cheat** system runs beside the
chains: the participants watch the one ordering the blocks, check what they receive, and report the
cheats to each other.

The code lives in `application/frontend/game-app/src/app/services/room-manager/classes/room/block-room`.

- [Overview](#overview)
- [Identity of the participants](#identity-of-the-participants)
- [Blocks and signatures](#blocks-and-signatures)
- [Ordering the blocks](#ordering-the-blocks)
- [Delivering the blocks](#delivering-the-blocks)
- [Catching up](#catching-up)
- [Watching the sequencer](#watching-the-sequencer)
- [Changing the sequencer](#changing-the-sequencer)
- [Hidden moves: commit then reveal](#hidden-moves-commit-then-reveal)
- [Hidden cards: mental poker](#hidden-cards-mental-poker)
- [Hidden bullets: the cylinder of the roulette](#hidden-bullets-the-cylinder-of-the-roulette)
- [Anti-cheat](#anti-cheat)
- [Messages](#messages)
- [Trust model and limits](#trust-model-and-limits)
- [Adding a message type or a chain](#adding-a-message-type-or-a-chain)

## Overview

A room (`BlockRoom`) runs **one block chain per feature**: `chat`, and the chain of its game, `chess`,
`poker` or `roulette`. Each chain orders its
blocks on its own, so a busy chat never delays the moves of the game. The chains share the WebRTC
connections and the identity of the participants.

Each chain is ordered by a single participant, the **sequencer**: the host of the room, then the
participant taking over when it leaves or when most of the others report it as cheating. The
participants sign their messages and submit them to the sequencer, which appends them to the chain
and broadcasts the blocks. A single participant orders the chain, so it can not fork; the others
watch it.

```mermaid
flowchart LR
    subgraph Room[BlockRoom]
        Registry[ParticipantRegistry<br/>keys of the participants]
        Chess[SequencedBlockChain<br/>chess]
        Chat[SequencedBlockChain<br/>chat]
        AntiCheat[AntiCheat<br/>cheat flags]
    end
    App[Chess game / chat] -- transmitMessage --> Room
    Room -- messenger --> App
    App -- reportCheat --> AntiCheat
    Chess -- reports --> AntiCheat
    Chat -- reports --> AntiCheat
    AntiCheat -- distrusted sequencer --> Room
    Chess & Chat -- keys --> Registry
    Room <-- WebRTC --> Peers[Other participants]
```

| Class | File | Role |
|---|---|---|
| `BlockRoom` | `block-room.ts` | Routes each message type to its chain, dispatches the received messages, names the sequencer, ticks the chains every 2 seconds |
| `SequencedBlockChain` | `block-chain/sequenced-block-chain.ts` | Submits, orders, receives, checks and delivers the blocks of one chain, watches the sequencer |
| `Chain` | `block-chain/chain.ts` | The list of blocks, hashing and signing |
| `ParticipantRegistry` | `block-chain/participant-registry.ts` | Exchanges the public keys, shared by all the chains |
| `ParticipantKeyStore` | `block-chain/participant-key-store.ts` | Keeps the key pair of the player in the browser |
| `AntiCheat` | `anti-cheat/anti-cheat.ts` | Collects the cheat reports into flags, names the accusers of a sequencer |
| `SynchronousChessOnlineGameSession` | `modules/chess/classes/game-sessions` | Seats the players, commits then reveals the moves, reports the cheated ones (see [Chess game session](chess-game-session.md)) |
| `SealedTurnStore` | `modules/chess/classes/game-sessions` | Keeps the hidden moves across the reloads of the page |
| `MentalDeck` | `modules/mental-poker/classes` | Shuffles, deals and opens a deck no participant sees, checks it at the end of the game (see [Mental poker](mental-poker.md)) |
| `SeventeenPokerSession` | `modules/seventeen-poker/classes/game-sessions` | Seats the players, deals each hand with a mental deck, reports the illegal actions (see [Seventeen Poker session](seventeen-poker-session.md)) |
| `Cylinder` | `modules/russian-roulette/classes/cylinder` | Loads, spins and fires a cylinder no participant sees, checks it at the end of the game (see [Russian roulette session](russian-roulette-session.md#the-cylinder)) |
| `RussianRouletteSession` | `modules/russian-roulette/classes/game-sessions` | Seats the players, fires the chambers of the cylinder, reports the illegal moves (see [Russian roulette session](russian-roulette-session.md)) |

The application only sees `Room.transmitMessage()`, `Room.messenger()` and `Room.reportCheat()`: a
message is delivered to every participant, its sender included, once its block is added to the chain
and checked.

## Identity of the participants

Each player has an **ECDSA P-384 key pair**, which signs its messages.

- **Kept across reloads.** `ParticipantKeyStore` stores the key pair of each player name in IndexedDB
  (database `synchronous-chess`, store `participant-keys`). A player reloading the page keeps its
  identity, so the blocks it signed before stay verifiable. The private key is not extractable: it
  can only sign. Without storage (private browsing, blocked site data), the page uses a key pair of
  its own, which a reload replaces.
- **Exchanged once per room.** `ParticipantRegistry` sends the public key to each new player, for all
  the chains at once. The request carries the key of the requester too, so if a request is lost (sent
  before the other side knew the player), the request of the other side still exchanges both keys.
  The key of a connection is registered once, from its request or its response.
- **Keyring.** A participant keeps the keys of the previous connections of its player: a player who
  lost its stored key signs with a new one, and its older blocks stay verifiable.
- **Departed participants** are kept 60 seconds, the time for the blocks they wrote to reach everyone,
  then forgotten. A participant who leaves before any of its keys is known is forgotten at once.

## Blocks and signatures

```ts
interface ChainEntry {      // a message of a participant
    id: string;            // random UUID, to detect a replayed entry
    data: AppMessage;      // { from, type, payload }
    signature: string;     // by the author
}

class Block {
    index: number;
    previousHash: string;
    entry: ChainEntry;
    sequencer: string;          // the participant who ordered the block
    time: number;               // when the sequencer ordered it, in milliseconds since 1970
    hash: string;
    sequencerSignature: string; // by the sequencer, over the hash
}
```

| What | Signed or hashed content | By |
|---|---|---|
| Entry signature | `chain id JSON(data)` | the author (`data.from`) |
| Block hash (SHA-256) | `chain index previousHash sequencer time entry.id entry.signature JSON(entry.data)` | |
| Sequencer signature | the block hash | the sequencer |

The **chain name** is part of both the entry signature and the block hash: an entry or a block of one
chain is not valid on another chain of the room.

The genesis block (index 0) is the same for every chain, with a fixed hash and the time 0.

**The time of a block** is set by its sequencer, on the time of its system when its page started, then
a monotonic clock: a clock of the system set, by the network or after a sleep, does not make it jump. It
never goes back from the previous block, nor goes more than a day after it, the first block of a chain
being before 2100: a block out of these bounds is invalid. So far ahead, adding seconds would not change
a time, and the next sequencers would give it to all their blocks; an honest chain never meets them, a
chain idle for more than a day going on from the latest time it may give. The time is the same on every
page, the history included, so a rule of the application reads it alike everywhere
(`Room.sequencedAt()`; the chat counts the messages of an author over the last seconds of the chain on
it). A new sequencer whose clock is late takes on the time of the chain: it adds the gap to its clock,
rather than giving the time of the latest block to the next ones.

The sequencer could forge the times, spreading a flood of its own over seconds that never passed. Each
participant watches its clock on the blocks it receives live (`SequencerClock`): the delay of a block,
from its time to its reception, is the gap between the two clocks plus the network, which only makes it
longer. The first live blocks of a sequencer, at least 5 over at least 30 seconds, set the shortest
delay, some of them late not mattering; a later block received more than 5 seconds sooner tells a clock
jumping ahead: the participant reports it once (`clockAhead`), and the block is kept, its time already
in the chain. The watch starts again when the clock of the system of the participant moves apart from
its monotonic clock (set, or the page asleep). A clock ahead from the first blocks on, or running late,
is not told apart from a slow network: a sequencer could pack the messages of an honest author, as it
could already hold them for less than 10 seconds, or spread its own messages back over an idle time of
the chain. Freezing its clock, giving every block the time of the previous one, it would hide an honest
author after 8 messages as long as it orders: telling a clock late from a page suspended or a slow
network would make the participants report honest sequencers.

## Ordering the blocks

```mermaid
sequenceDiagram
    participant P as Player
    participant S as Sequencer (host)
    participant O as Other participants
    P->>P: sign the entry, keep it as pending
    P->>S: SUBMIT_ENTRY
    P->>O: SUBMIT_ENTRY (they watch it gets ordered)
    S->>S: check the submitter is the author, the type<br/>belongs to the chain and the author signature
    S->>S: append the block, sign its hash
    S->>P: NEW_BLOCK
    S->>O: NEW_BLOCK
    Note over P,O: each one checks the block, adds it,<br/>then delivers the message to the application
```

- An entry is submitted to **every participant**: the sequencer orders it, the others watch it.
- A participant accepts an entry only from its own author: the WebRTC connection proves who sent it.
  It checks the author signature: the sequencer before ordering, so it can not be blamed for a forged
  entry, the others before watching, so they do not report an honest sequencer for refusing it. The
  entries of an author whose key is still being exchanged wait for it (at most 32 per author). An entry
  already in the chain (submitted again) is not ordered twice.
- When the sequencer transmits a message, it orders the entry directly.
- A participant adds a `NEW_BLOCK` only from its current sequencer. Each chain handles its messages one
  at a time, so the blocks are added strictly in order.
- The entries of the local participant stay **pending** until their block is added: they are submitted
  again when the sequencer becomes ready (its key is received) or when it changes.

## Delivering the blocks

Every block the sequencer sends is added to the chain, so that the chains of all the participants stay
the same. The application receives the blocks **in their order, once checked**, and every participant
leaves the same cheated blocks out of it, so that the game and the chat stay the same everywhere:

- a block not signed by its sequencer, a replayed entry, or an entry of another chain is left out;
- an entry not signed by its author is left out;
- the entry of an author whose key is still being exchanged waits for the key, and the next blocks
  with it;
- the entry of an author who left before the participant joined (unknown) is delivered: its key can
  not be known.

## Catching up

A participant missing blocks asks for them with `GET_BLOCKS_REQUEST { from }`, the index of its next
block. The response carries the blocks that fit in **64 000 characters of JSON**, at least one: a data
channel message holds 256 KiB in Chromium, a character taking up to 3 bytes, and the blocks of a card
game carry decks of several kilobytes. A response reaching the index asked from is followed by a request
for the next page, until an empty one: a response of blocks before it is not the page asked for.

A participant catches up:

- with the sequencer, once the key of the sequencer is received (joining the room);
- with the sequencer, when a `NEW_BLOCK` leaves a gap after its latest block;
- with another participant, whose chain head goes further than its own;
- with the new sequencer, when it changes.

A participant only processes the responses it asked for. A block received from a participant other
than the sequencer must be signed by its sequencer. A refused block stops the catch up with that
participant, since asking again would bring the same block.

The blocks a participant joining the room catches up with are the **history** of the chain:
`Room.isHistory()` tells the application whether a message it delivers is one, so that a reloaded page
replaying them does not animate them as new moves. A chain is caught up once every participant it
asked for blocks answered with an empty page (the sequencer, or the others when its link to it is lost),
once a `NEW_BLOCK` of the sequencer follows its latest block, or once it collected the blocks as a new
sequencer; the sequencer of a new room starts caught up.
The blocks added before are its history, delivered later included (waiting for the key of their author);
the ones added after are live, those caught up with later (a gap, a lost connection) included.

## Watching the sequencer

Every 2 seconds, the room ticks its chains:

- **Withheld entries.** Each participant watches the entries submitted to the sequencer, once their
  author signature is checked. An entry the sequencer does not order within **10 seconds**, while it
  orders other entries of the chain, is reported as censored. A new sequencer gets the same delay
  again.
- **Different chains.** Each participant shows the head of its chain (index, hash, sequencer and its
  signature) to the others, and to each new participant once its key is received. A head:
  - further than the local chain makes the participant catch up with the one showing it, so a block the
    sequencer withheld from it still arrives;
  - differing from the local block at the same index, both signed by the same sequencer, proves the
    sequencer sent different chains to the participants: it is reported as a conflicting block. A
    difference without such a proof is only logged.

## Changing the sequencer

The sequencer changes when it leaves the room, or when **more than half of the other participants**
reported it for a cheat only a sequencer can commit (see the table below). The next sequencer is the
first participant by name among the connected ones, a distrusted sequencer never coming back: every
participant knows the same participants and reports, so they all name the same one. When no
participant can take over, the sequencer stays.

**Leaving the room.** A participant losing its connection to another one does not know whether the
other left, or only their link broke. Each participant tells the others whom it is connected to
(`connectedParticipants`), whenever a participant becomes ready or leaves. A participant has left the
room once **every other connected participant** told it lost it too: a participant which did not tell
yet is waited for, and a participant connected again before that has not left. So the participants
all notice a departure, and change their sequencer, from the same participants; a single broken link
changes nothing.

**Restoring a connection.** Until then, the connection is negotiated again through a participant still
connected to both: every participant relays the signals of two others, as the host does for a joining
player. Of the two, the first by name connects, the other answers through the same relay; the attempt
is repeated at each tick of the room (2 seconds) while the other is lost. A participant which lost
all the others may have lost its own network: it joins the room again through the websocket, the
others connecting to it as to a joining player. Refused for 20 seconds because the host is gone, it is
the last participant: the participants it lost have left the room, and it takes it over. The host
does so too once it lost several participants: they may still be connected to each other, so it closes
the socket of its room for them to take it over, then joins it; nobody taking it over, it takes its
room back. Having lost a single participant, the host decides at once that it left: alone too, the
other one joins the room again.

```mermaid
sequenceDiagram
    participant N as New sequencer
    participant O as Other participants
    N->>O: GET_BLOCKS_REQUEST { handover } (to each one but the former sequencer)
    Note over O: answers once it follows the new sequencer too,<br/>refusing the blocks of the former one from then on
    O->>N: GET_BLOCKS_RESPONSE
    O->>N: SUBMIT_ENTRY (their pending entries, queued)
    Note over N: once every connected participant answered<br/>(or left, or 10 seconds passed), stop syncing
    N->>N: order its own pending entries, the watched ones, then the queued ones
    N->>O: NEW_BLOCK ...
```

The former sequencer may have sent its last blocks to some participants only. The new sequencer first
collects the blocks of all the participants, so these blocks are kept and **no block is rolled back**:

- The participants notice the change at different times. A participant answers the collection only
  once it follows the new sequencer itself: the blocks the former sequencer sends it until then are
  in its answer, and it refuses the next ones.
- The former sequencer is not asked: it is distrusted, and the blocks it sent are collected from the
  participants who received them.
- A participant not following the new sequencer within **10 seconds** is not waited for anymore, so a
  participant who never answers can not block the chain.

The entries the former sequencer did not order are submitted again by their authors, and the new
sequencer orders the entries it watched before taking over; an entry already in the chain is not
ordered twice.

**Joining after a change.** A player joining the room, or reloading the page, starts with the host as
sequencer: it missed the changes. Once the key of a participant is received, each side tells the other
which sequencer it follows, the number of changes it made and the distrusted sequencers
(`sequencerState`). A participant follows the sequencer that more than half of the other participants
follow, if they made more changes than itself; a single participant can not make it follow another
sequencer.

**Taking the room over.** Joining goes through the host, which holds the room on the websocket API. Once
the room agrees its host left, the sequencer, after the handover, takes it over: it moves the room of
the API to a new socket of its own (`reconnect` with its name and the token it joined with, retried
while the former host connection is still open), tells the API the players of the room (the former
host leaves them), then lets the players join and relays their signals. The host removes a player from
the room of the API once the room agrees it left, not when only its connection is lost: it may still
take the room over. The other participants
connect to the joining players through it. The former host, back on a reloaded page, joins the room
again like any player, at once from the URL of its page and the session of its tab.

## Hidden moves: commit then reveal

In synchronous chess both players play at the same time. Without care, the first move ordered would
reach the other player before it plays, and the sequencer would see it even before ordering it. The
online game session hides the moves:

1. A player plays its move (or promotion) locally, and sends only a **commitment**: the SHA-256 of
   the turn number, its color, the action and a random salt (`SC_GS_commit`).
2. Once the commitments of every player of the turn are in the chain, each player **reveals** its
   action and salt (`SC_GS_reveal`). A turn played by a single player is revealed at once.
3. The participants check each reveal against the commitment of its player for the current turn, then
   run it. The first commitment of a player for a turn is final.

A reveal not matching its commitment (`invalidReveal`) or a move against the rules (`illegalMove`) is
ignored by every participant alike, and reported against its player with `Room.reportCheat()`.

The turn number is counted by each participant, the same for all of them since they run the same
actions.

A player plays its action at once, and a turn played alone ends at once, so it may play the next turn
before the commitments of the previous one are in the chain: it keeps each action it played until it
is revealed. A player runs its own actions when playing them; after a reload of the page, the chain
replays its reveals, which it runs like the ones of the other players.

**Reloading the page.** `SealedTurnStore` keeps the actions the player committed to and whose reveal
is not in the chain yet, with their salt, in the session storage of the tab (key
`synchronous-chess:sealed-turns:<room>:<player>`). When the chain replays a commitment of the player
that its new page did not play, the stored action of that turn is used if it matches the commitment:
the action of a previous game in a room of the same name never does. It is played once the game
reaches its turn, then revealed as usual. The page does not know whether its reveal is in the chain
already, so it may reveal it twice: the other participants ignore a reveal matching the commitment of
a turn its player already played. Without session storage (blocked site data), the action is lost.

## Hidden cards: mental poker

A card game needs more than a hidden move: a hand stays hidden for a whole round, and no participant
can deal, the players and the sequencer included. `MentalDeck` (`modules/mental-poker`) runs the
mental poker of Shamir, Rivest and Adleman over the chain of its game: each player encrypts and
shuffles the deck, then puts a key of its own on each card; a card is dealt by asking the keys of every
player but its recipient, and opened by asking all of them. Once the game is over, the players disclose
all their keys and every participant checks the deck. See [Mental poker](mental-poker.md), and the
Seventeen Poker, its first game, in [Seventeen Poker session](seventeen-poker-session.md).

## Hidden bullets: the cylinder of the roulette

The 24-shot Russian roulette hides the bullets each player loads, and the offset of the cylinder, from every
participant, the players included: a shot tells only the count of bullets of its chamber. The `Cylinder`
(`modules/russian-roulette`) runs the exponential ElGamal over the chain of its game: each player gives its share of
the key with its proof, loads its bullets under the key of both with the proof of a bit for each chamber and of their
count, then each player turns the cylinder and re-randomizes it. A chamber fires with the share of each player, proven
made with its key. Once the game is over, the players disclose their keys and every participant checks the spins. See
[Russian roulette session](russian-roulette-session.md#the-cylinder) and
[The exponential ElGamal](mental-poker.md#the-exponential-elgamal).

## Anti-cheat

The participants report the cheats they detect with an `anti_cheat` message to all the others, outside
the chains: a report does not need to be ordered, and the sequencer can not hide it.

### Checks

| Reason | Detected when | Against | Left out of the application |
|---|---|---|---|
| `forgedAuthor` | The entry is not signed by any known key of its author | the sequencer, which checks it (counted against it when reported by the author only) | yes |
| `replayedEntry` | The entry id is already in the chain | the sequencer | yes |
| `wrongChain` | The message type belongs to another chain | the sequencer | yes |
| `forgedSequencing` | The block is not signed by its sequencer | the sequencer | yes |
| `invalidBlock` | The hash of a block of the sequencer does not match its content, or its time goes back from the previous block, or more than a day after it | the sequencer | not added |
| `conflictingBlock` | The sequencer sent another block for an index already in the chain, a block not following the latest one, or a head proves it signed two blocks for the same index | the sequencer | not added |
| `censoredEntry` | The sequencer orders other entries, not this one, for 10 seconds | the sequencer | |
| `clockAhead` | A live block of the sequencer is received more than 5 seconds sooner, from its time, than the shortest delay of its first ones (5 over 30 seconds at least): its clock jumped ahead | the sequencer | no |
| `illegalMove` | A revealed move, an action of the poker (a bet, an exchange) or a move of the roulette (a pass, a shot) is against the rules | the player | yes |
| `invalidReveal` | A revealed move does not match its commitment, or its turn, or a random part of the draw of the roulette its commitment | the player | yes |
| `invalidShuffle` | A deck is not one (a card missing or twice), or, once the keys are disclosed, not made from the previous one with the keys of its player | the player | a deck that is not one breaks the deck |
| `invalidCardKey` | A key is malformed, does not give the card to its recipient (with two players), or is not the one disclosed at the end of the game | the player | a malformed key |
| `invalidLoad` | A key of a cylinder without the proof of its player, or a load without the proofs of its bullets | the player | yes |
| `invalidSpin` | A spin of a cylinder is not one (a chamber missing or out of the group), or, once the keys are disclosed, not the cylinder received turned | the player | a spin that is not a cylinder breaks the cylinder |
| `invalidShare` | A share of a chamber without its proof, or a key disclosed that is not the one of its player | the player | yes |
| `invalidMessage` | A message of the chat not of the form the composer sends: over 1000 characters, or blank. The first one of each author only, the same block on every page | the player | yes |

The reasons **against the sequencer** count to take the ordering away from it: only reports from
connected participants other than the sequencer count, and more than half of them must have reported
it. A `forgedAuthor` report counts only when the author of the entry makes it: an author giving
different keys to the participants makes some of them find its entries forged, while the sequencer
checked them, so only the author knows for sure its entry was forged.

### Reports and flags

A participant reports a cheat once per subject and reason. `AntiCheat` gathers its own reports and the
reports of the others into **flags**, one per block or withheld entry:

```ts
interface CheatFlag {
    chain: BlockChainName;
    subject: string;    // the hash of the block, or the id of the withheld entry
    index?: number;     // the index of the block, none for a withheld entry
    author: string;     // the author the entry claims
    sequencer: string;
    reports: ReadonlyArray<{ reporter: string; reason: CheatReason }>;
}
```

The room exposes them as the `BlockRoom.cheatFlags` signal. The chess and chat pages notify each new
report (`modules/room-layout/cheat-notifications.ts`).

## Messages

| Origin | Type | Payload | Sent by → to |
|---|---|---|---|
| `block_room_participant` | `getPublicKeyRequest` | `{ publicKey }` | a participant → a new player |
| `block_room_participant` | `getPublicKeyResponse` | `{ publicKey }` | → the requester |
| `block_room_service` | `submitEntry` | `ChainEntry` | a participant → everyone |
| `block_room_service` | `newBlock` | `Block` | the sequencer → everyone |
| `block_room_service` | `getBlocksRequest` | `{ from, handover? }` | a participant → the one it catches up with, a new sequencer → each participant |
| `block_room_service` | `getBlocksResponse` | `Block[]` (64 000 characters of JSON at most, one block at least) | → the requester |
| `block_room_service` | `chainHead` | `{ index, hash, sequencer, sequencerSignature }` | a participant → everyone, every 2 seconds |
| `anti_cheat` | `cheatReport` | `CheatReport` | a participant → everyone |
| `anti_cheat` | `sequencerState` | `{ sequencer, handovers, distrusted }` | a participant → each participant whose key it receives |
| `anti_cheat` | `connectedParticipants` | `{ participants }` (sender excluded) | a participant → everyone, when a participant becomes ready or leaves |

The `block_room_service` messages carry the name of their chain in a `chain` field.
`isNetworkMessage` validates the envelope of the received messages (origin, type, known chain name);
their payload is trusted, and a payload making a handler throw is logged.

The chess game sends `SC_GS_seat`, `SC_GS_commit` and `SC_GS_reveal` through the
`chess` chain, the Seventeen Poker its `SP_*` and `MP_*` messages through the `poker` chain, the roulette its `RR_*`
messages through the `roulette` chain, the chat `chatMessage` through the `chat` chain.

**The flood of the chat.** The sequencer orders every message of the chat: refusing the messages of an
author over the rate, it would be reported for censoring them by the participants watching them. Each
page filters them instead, on the times of the chain alone (`chat-flood.ts`): an author with 8 messages
already within the last 10 seconds of the chain is hidden, its hidden messages counted, until its rate
falls back; the log tells it once. Every page hides the same messages, a page reloaded and a participant
joining late included. The composer sends 3 messages in 10 seconds at most, and waits while 5 of its
messages are not sent back: held while the room has no sequencer, they are ordered at once when it has
one again. The network packing the messages of an honest player on the chain never makes it pass 8.

## Trust model and limits

- **The sequencer decides the order**, and can not change the entries, which are signed by their
  authors. Forged, replayed, misrouted, withheld or conflicting blocks are reported, left out of the
  application, and take the ordering away from it once most of the others report it.
- **The moves are hidden** until every player of the turn is committed: neither the sequencer nor the
  opponent can adapt its move.
- **The connection authenticates the sender** of a message (`from` is stamped by the receiving side), so
  submissions and reports need no signature.
- **A majority can take the ordering away.** With two participants, a single report of the other one is
  enough. A group of participants reporting falsely together can name another sequencer, not change
  the blocks.
- **Keys of a player.** Each participant checks the entries against the keys the author gave it, so
  the sequencer can not forge them. A player giving different keys to the participants makes them
  leave its own entries out differently: their games then differ. It can not make them report the
  sequencer.
- **The time of the blocks** is the clock of the sequencer, watched by the others on the live blocks
  only: a page reloaded or joining late trusts the times of the history. A page suspended, or a slow
  network, through the first 30 seconds of a sequencer makes its receiver report an honest sequencer:
  with two participants, that single report takes the ordering away.
- **History of departed players.** A participant who joins after a player left for good can not check
  the signatures of its blocks: they are trusted on the hash chain of the sequencer.
- **Reloading during a game** replays the moves from the chain, and the hidden move committed and not
  revealed yet from the session storage. A move played in the new page before the chain replays its
  commitment replaces the stored one, and can not be revealed: the first commitment is final.
- The app is in development: the message format changes freely, all the participants run the same
  build.

## Adding a message type or a chain

The chain of each message type is declared next to the payloads of its feature, with a
`BlockChainRouting`:

```ts
// modules/chat-page/components/chat/chat.component.ts
export const chatBlockChains: BlockChainRouting<ChatPayloads> = {
    [ChatMessengerType.CHAT_MESSAGE]: BlockChainName.CHAT,
};
```

- **New message type**: add it to the payloads of the feature and to its routing; the compiler requires
  every type to be routed.
- **New chain**: add its name to `BlockChainName` (`block-chain-name.enum.ts`) and route the types to it.
- **Page using several features**: merge their routings with `mergeBlockChainRoutings`, which refuses a
  type routed twice, and pass the result to `RoomManagerService.buildBlockRoom`:

```ts
// modules/chess/pages/synchronous-chess/synchronous-chess.ts
this.roomManagerService.buildBlockRoom<ChatPayloads & ChessPayloads>(
    setup, this.maxPlayer, mergeBlockChainRoutings(chatBlockChains, chessBlockChains),
);
```

- **Cheats of the application**: report a delivered message the application finds cheated with
  `room.reportCheat(message, reason)`, as the chess session does for the illegal moves.
- **Card game**: route the messages of its decks to the chain of the game with
  `mentalDeckBlockChains(chain)`, merged with the routing of the game (see [Mental poker](mental-poker.md)).

To simulate a slow network while debugging, add `?latency=<ms>` to the URL: the sequencer delays the
broadcast of its blocks.
