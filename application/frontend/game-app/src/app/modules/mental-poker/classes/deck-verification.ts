import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { DeckCheat, DeckStep, Disclosure, MentalDeckState, PublishedKey } from './mental-deck-state';
import { SraCipher } from './sra-cipher';

/**
 * Checks a deck once every player disclosed its keys: each deck a player left is the previous one, encrypted then
 * shuffled with its shuffle key, or locked with its keys of the cards; each key it gave during the game is the one it
 * locked the card with. The cards were then dealt from a fair deck: each player shuffled it, none knowing the order.
 * @param pause yields between two computations, a computation taking several milliseconds
 * @returns the cheated messages, none for a fair deck
 */
export async function verifyDeck(state: MentalDeckState, cipher: SraCipher, pause: () => Promise<void>): Promise<ReadonlyArray<DeckCheat>> {
    const cheats: DeckCheat[] = [];
    let input: ReadonlyArray<bigint> = state.plainDeck;

    for (const step of state.shuffles) {
        // eslint-disable-next-line no-await-in-loop -- each step follows the previous one
        if (!await isShuffled(input, step, disclosureOf(state, step), cipher, pause)) {
            cheats.push({ message: step.message, reason: CheatReason.INVALID_SHUFFLE });
        }
        input = step.cards;
    }

    for (const step of state.locks) {
        // eslint-disable-next-line no-await-in-loop -- each step follows the previous one
        if (!await isLocked(input, step, disclosureOf(state, step), cipher, pause)) {
            cheats.push({ message: step.message, reason: CheatReason.INVALID_SHUFFLE });
        }
        input = step.cards;
    }

    return [...cheats, ...wrongKeys(state)];
}

function disclosureOf(state: MentalDeckState, step: DeckStep): Readonly<Disclosure> {
    return state.disclosures.get(step.message.from) as Disclosure;
}

/** The deck encrypted with the shuffle key holds the same cards, in any order */
async function isShuffled(input: ReadonlyArray<bigint>, step: DeckStep, disclosure: Readonly<Disclosure>, cipher: SraCipher, pause: () => Promise<void>): Promise<boolean> {
    const expected = new Set<bigint>();

    for (const card of input) {
        expected.add(cipher.apply(card, disclosure.shuffleKey));
        // eslint-disable-next-line no-await-in-loop -- one computation at a time, for the page to stay fluid
        await pause();
    }

    return step.cards.every((card: bigint) => expected.has(card));
}

/** Each card is the one before, its shuffle key replaced with its card key */
async function isLocked(input: ReadonlyArray<bigint>, step: DeckStep, disclosure: Readonly<Disclosure>, cipher: SraCipher, pause: () => Promise<void>): Promise<boolean> {
    for (const [position, card] of input.entries()) {
        // The disclosed key of a card decrypts it: its inverse locked it
        if (cipher.apply(card, cipher.lockKey(disclosure.shuffleKey, cipher.inverse(disclosure.cardKeys[position]))) !== step.cards[position]) {
            return false;
        }
        // eslint-disable-next-line no-await-in-loop -- one computation at a time, for the page to stay fluid
        await pause();
    }

    return true;
}

/** The keys given during the game that are not the disclosed ones, once per message */
function wrongKeys(state: MentalDeckState): ReadonlyArray<DeckCheat> {
    const messages = new Set<DeckCheat['message']>();

    for (let position = 0; position < state.size; position++) {
        state.publishedKeys(position).forEach(({ message, key }: Readonly<PublishedKey>, player: string) => {
            if (state.disclosures.get(player)?.cardKeys[position] !== key) {
                messages.add(message);
            }
        });
    }

    return [...messages].map((message) => ({ message, reason: CheatReason.INVALID_CARD_KEY }));
}
