# Mental poker

A card game played in a room has no dealer: every message goes through the block chain of the room
(see [Block chains and anti-cheat](blockchain-and-anti-cheat.md)), broadcast to every participant, and
the players and the sequencer are participants like the others. A deck shuffled from a shared seed would
show every hand to everyone.

`MentalDeck` deals cards no participant can see but their recipient, with the **mental poker** of
Shamir, Rivest and Adleman: a commutative cipher (SRA) and a key per card. It knows no game: a deck holds
`size` cards, numbered from 0, and the game names the card of each number: any card game can use it,
from 2 players, as the Seventeen Poker (#198) and the Liar's Deck (#175) will.

The code lives in `application/frontend/game-app/src/app/modules/mental-poker`.

- [The cipher](#the-cipher)
- [The protocol](#the-protocol)
- [Using a deck in a game](#using-a-deck-in-a-game)
- [Messages](#messages)
- [Reloading the page](#reloading-the-page)
- [Checking the deck](#checking-the-deck)
- [Trust model and limits](#trust-model-and-limits)
- [The exponential ElGamal](#the-exponential-elgamal)

| Class | File | Role |
|---|---|---|
| `SraCipher` | `classes/sra-cipher.ts` | The cipher: keys, encryption, the encoding of the cards |
| `MentalDeckState` | `classes/mental-deck-state.ts` | What the chain tells of a deck, the same for every participant: the steps, the keys asked for and given |
| `MentalDeckTable` | `classes/mental-deck-table.ts` | The decks of a game: receives their messages from the start of the session, keeps the ones of a deck not created yet |
| `MentalDeck` | `classes/mental-deck.ts` | A deck of a game: applies its messages, makes and sends the steps and the keys of the local player, reads its cards |
| `verifyDeck` | `classes/deck-verification.ts` | Checks a deck once every player disclosed its keys |
| `SecretStore` | `classes/secret-store.ts` | Keeps the secrets of the player across the reloads of the page, for a deck or a cylinder |
| `KeptSecrets` | `classes/kept-secrets.ts` | The secrets of the player in a deck or a cylinder: read from the `SecretStore`, drawn and stored first, dropped once they are not the ones of the chain, lost once |
| `StepRunner` | `classes/step-runner.ts` | Makes the steps of the player in a deck or a cylinder one at a time, again when the chain changed meanwhile, a step failing logged |
| `ExponentialElGamal` | `classes/exponential-elgamal.ts` | Another cipher of the same group, a count hidden in each cipher text (see [The exponential ElGamal](#the-exponential-elgamal)) |
| `zk-proofs` | `classes/zk-proofs.ts` | The proofs of the exponential ElGamal: equal logarithms (Schnorr, Chaum-Pedersen), a bit |

## The cipher

The participants share a safe prime p = 2q + 1, the 2048-bit MODP group of RFC 3526. A card `i` is the
square `(i + 2)² mod p`: the squares form the subgroup of order q, which every cipher text stays in.
Without it, the symbol of Legendre of a cipher text would tell one bit of its card (the attack of Lipton):
every value received must be a square, checked with the symbol of Jacobi (0.2 ms, against 10 ms for an
exponentiation), or a player could mark a card and follow it through the shuffles.

A key is an exponent `e` from 1 to q − 1, its inverse `d = e⁻¹ mod q` decrypts: `(mᵉ)ᵈ = m`. The cipher
commutes, `(m^e₁)^e₂ = (m^e₂)^e₁`: a card encrypted by several players is decrypted with their keys, in
any order, or with the product of the keys at once. The numbers travel in hexadecimal.

With 17 cards and 2 players, a player computes 34 exponentiations of 2048 bits per deck, about 10 ms
each on a computer. The deck yields to the browser every 40 milliseconds of computation (`timeSlices`), so the page
stays fluid: it posts a message to the page and awaits it, which a hidden page runs at once, where a timer would wait
a second at least (a minute in Chrome after 5 minutes hidden), and the other players with it.

## The protocol

The game gives the players in an order, the same for every participant. In this order:

1. **Shuffle** (`MP_shuffle`): each player encrypts every card of the deck it receives with a shuffle
   key of its own, then shuffles it. The first one starts from the cards themselves.
2. **Lock** (`MP_lock`): each player removes its shuffle key and puts a key of its own on each card,
   in one exponentiation per card (`d_shuffle × e_card`). The cards no longer move.
3. **Deal** a card to a player: every other player gives its key of the card (`MP_keys`). Only the
   recipient reads it, with its own key, which it never gives during the game.
4. **Open** a card: every player gives its key of the card. The recipient of a card dealt before gives
   its own; a card never dealt (a card on the table) needs the keys of all of them.
5. **Disclose**, once the game is over: every player gives all its keys (`MP_disclose`). Every
   participant checks the deck and reads every card, the folded hands included.

The sequencer orders the messages and only sees cipher texts. A spectator applies them like the
players, never sends any, and reads the open cards only.

## Using a deck in a game

```ts
// The routing of the game, merged with the one of its decks: they share the chain of the game
const routing = mergeBlockChainRoutings(gameBlockChains, mentalDeckBlockChains(gameChain));

// The game session creates its table at once, before any message of a deck can come
const table = new MentalDeckTable(room);

// Every participant creates the deck when the message of the game starting it applies
const deck = table.deck({ id: `${ gameId }:${ hand }`, size: 17, players: [first, second] });

// The game deals and opens as its own messages apply, on every participant
await Promise.all([deck.deal([0, 1, 2, 3, 4], first), deck.deal([5, 6, 7, 8, 9], second)]);
deck.cards();                             // what the local participant reads: position → card
const shown = await deck.open([0, 1, 2]); // position → card, the same for every participant
const verification = await deck.disclose();
```

- **The order of the chain.** The game calls `deal()`, `open()` and `disclose()` when the message of
  the game asking for it applies, in the order of the chain. The game of a participant may apply its
  messages later than the deck applies its own, awaiting a deck meanwhile (the recipient decrypting its
  cards, a reloaded page replaying the chain): a key given before the game of a participant asks for it
  is kept, as a disclosure, and the messages of a deck not created yet wait in the table for it: they
  apply before the new deck acts, a reloaded page finding its own steps in them.
- **What the game may rely on.** `phase`, `waitingFor` and the promises are the same for every
  participant: the game may act on them. `cards` is what the local participant reads: the interface
  shows it, the local player decides with it, the rules of the game never depend on it. The promise of
  `open()` gives the cards opened to everyone, which the rules may use.
- **Waiting in order.** The game handles its messages one after the other, awaiting the promises of the
  deck: the deck applies its own messages meanwhile, so the game reaches the same state on every
  participant. A deal resolves once every key is in the chain, and the recipient read its cards: the
  first player to read its cards learns nothing before the other one, the game waiting for both deals.
- **The id** of a deck is unique in the room, and across the rooms of the same name: it holds a random
  part of **each** player, drawn for each game and given in the chain (the Seventeen Poker: a salt of
  each seat). A player could otherwise give the id of a former deck, and make another one use again the
  secrets of that deck, kept by its page until disclosed: knowing the cards of the former deck, it would
  know the new one.
- **A broken deck.** A step that is not a deck breaks it (`phase` is `broken`): the promises of its
  deals and openings reject, its disclosure resolves `cheated`, the game decides what follows.

## Messages

All the messages go through the chain of the game (`mentalDeckBlockChains(chain)`), and carry the id
of their deck.

| Type | Payload | Sent by | When |
|---|---|---|---|
| `MP_shuffle` | `{ deck, cards }`, the deck encrypted and shuffled | each player in turn | the deck is created, then the previous player shuffled it |
| `MP_lock` | `{ deck, cards }`, the deck locked | each player in turn | every player shuffled it, then the previous player locked it |
| `MP_keys` | `{ deck, keys: [{ position, key }] }` | a player | the game dealt or opened cards it holds a key of |
| `MP_disclose` | `{ deck, shuffleKey, cardKeys }` | each player | the game asked for the disclosure |

The first step of a player is final: a step out of its turn is ignored, as the one a reloaded page
sends again. The first key of a player for a card is final too, as its first disclosure, whether the
game asked for them yet or not. The keys and the disclosures are taken once the deck is locked only.

## Reloading the page

`SecretStore` keeps the secrets of the player for each deck (shuffle key, permutation, card keys) in
the session storage of the tab, under `synchronous-chess:deck-keys:<room>:<player>:<deck>`. They are
stored **before** anything made with them is sent, and never drawn again. They are removed once the
deck is checked, disclosed, or broken.

The reloaded page creates the decks again as the chain replays the messages of the game, then reads
its cards with its stored keys. It does not know which of its messages are in the chain:

- a step it makes again before the chain brings back the first one is the same deck, made from the
  same secrets, and is ignored by everyone;
- the keys it gives again are ignored the same way.

Without session storage, the secrets are lost: the page does not read its cards nor give its keys, and
the deck waits for it. It still reads the cards whose keys are all in the chain, as the open ones. A page
drawing new secrets, the chain replaying a step it made with former ones,
finds that its secrets do not make its step in the chain: it drops them, rather than give wrong keys.

## Checking the deck

Once every player disclosed its keys, each participant replays the deck (`verifyDeck`):

- each **shuffle** is the previous deck encrypted with the shuffle key of its player, the same cards in
  any order;
- each **lock** is the previous deck, each card with the shuffle key of its player replaced with its
  key of the card;
- each **key given during the game** is the one disclosed.

Each cheat is reported against its message with `Room.reportCheat()`: `invalidShuffle` for a step,
`invalidCardKey` for a key. The cards were then dealt from a fair deck: every player shuffled it, none
of them knowing the order. The check computes about 4 × 17 exponentiations per deck of 2 players: it
runs once the game is over, yielding to the browser, and `verification` tells its result. `disclose()`
resolves once the deck is checked and every card read.

Some cheats are found earlier, by every participant alike:

- a step that is not a deck: a card missing, a card twice, a value out of the group or not a square
  (`invalidShuffle`, the deck breaks);
- a malformed key or disclosure (`invalidCardKey`, ignored).

The recipient of a card finds a key not giving any card at once. With two players, the key of the
other player is wrong: it reports it (`invalidCardKey`). With more players it can not tell whose key is
wrong, and the disclosure tells it.

## Trust model and limits

- **No participant reads a card before the game deals or opens it**, the sequencer included: each card
  is encrypted with a key of every player. Players colluding together read their cards to each other.
- **No player chooses the order of the deck**: each one shuffles it without knowing the order the
  previous ones left. The last player to shuffle can stack the deck it receives, encrypted cards it can
  not read: the check at the end finds a deck not made from the previous one.
- **A player withholding its keys** stops the deck: the others wait for it. The game decides what a
  player not answering means; the deck waits as long as the player keeps its seat.
- **A player never disclosing its keys** leaves the deck unchecked: `verification` stays `pending`.
- **The cards are hidden for the length of a game**: the keys are disclosed at its end. A discrete
  logarithm of 2048 bits keeps them hidden far longer.

## The exponential ElGamal

The 24-shot Russian roulette (see [Russian roulette session](russian-roulette-session.md#the-cylinder)) hides no card
but a count in each chamber of a cylinder: whether it holds a bullet of a player, or of both. A chamber fired tells its
count only, not whose bullets they are, which the SRA cipher can not do: a card decrypted is the card itself, and its
owner would recognize it. `ExponentialElGamal` works in the same group, the squares modulo the safe prime, with
g = 4, a square whatever the prime:

- A count m under the key h is `(g^r, g^m × h^r)`, r random: the product of two cipher texts hides the sum of their
  counts, and multiplying a cipher text by an encryption of 0 re-randomizes it, the same count under another
  randomness. Without the key, no one tells a cipher text re-randomized from a new one (decisional Diffie-Hellman), nor
  follows it through a list turned and re-randomized.
- The players each hold a share x of the key `h = g^(x₁ + x₂) = h₁ × h₂`: a cipher text is decrypted with the share
  `c1^x` of each one, the count found by comparing `c2 / (c1^x₁ × c1^x₂)` with the first powers of g.

The proofs (`zk-proofs`) are non interactive (Fiat-Shamir): the challenge is the SHA-256 of the group, of the context
of the proof (the id of the game, the step, the seat, the chamber) and of every value it binds, modulo q. A proof
travels as its challenges and its responses, the verifier rebuilding the commitments from them.

| Proof | Proves | Against |
|---|---|---|
| `proveEqualLogs`, one base | the player knows x of its share of the key h = g^x (Schnorr) | a share of the key made from the other one, which would decrypt alone |
| `proveEqualLogs`, two bases | a share of a decryption is `c1^x`, x of its share of the key (Chaum-Pedersen) | a share chosen to give another count |
| `proveBit` | a cipher text hides 0 or 1, without telling which (Cramer, Damgård and Schoenmakers) | a chamber loaded with a count of its choice |

The roulette also proves the bullets of a load with `proveEqualLogs`: the product of its cipher texts, divided by g³,
is an encryption of 0, a player loading neither more nor fewer bullets than the rules.
