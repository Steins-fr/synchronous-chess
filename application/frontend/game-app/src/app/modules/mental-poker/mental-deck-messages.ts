import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { AppMessagesOf } from '@app/services/room-manager/classes/webrtc/messages/room-message';

export enum MentalDeckMessageType {
    /** A player encrypted every card of the deck with its shuffle key, then shuffled it */
    SHUFFLE = 'MP_shuffle',
    /** A player replaced its shuffle key with a key of its own for each card */
    LOCK = 'MP_lock',
    /** A player gives its keys of some cards, to deal or open them */
    KEYS = 'MP_keys',
    /** A player gives all its keys, once the game is over, for every participant to check the deck */
    DISCLOSE = 'MP_disclose',
}

/** The deck as a player leaves it, its cards in hexadecimal */
export interface DeckStepMessage {
    deck: string;
    cards: ReadonlyArray<string>;
}

export interface CardKey {
    position: number;
    /** The key decrypting the card, in hexadecimal */
    key: string;
}

export interface CardKeysMessage {
    deck: string;
    keys: ReadonlyArray<Readonly<CardKey>>;
}

export interface DiscloseMessage {
    deck: string;
    /** The key the player encrypted the deck with before shuffling it, in hexadecimal */
    shuffleKey: string;
    /** The key decrypting each card, by position, in hexadecimal */
    cardKeys: ReadonlyArray<string>;
}

export interface MentalDeckPayloads {
    [MentalDeckMessageType.SHUFFLE]: DeckStepMessage;
    [MentalDeckMessageType.LOCK]: DeckStepMessage;
    [MentalDeckMessageType.KEYS]: CardKeysMessage;
    [MentalDeckMessageType.DISCLOSE]: DiscloseMessage;
}

export type MentalDeckMessage = AppMessagesOf<MentalDeckPayloads>;

/**
 * The deck goes through the chain of its game: its messages are ordered with the ones of the game, which deal the cards
 */
export function mentalDeckBlockChains(chain: BlockChainName): BlockChainRouting<MentalDeckPayloads> {
    return {
        [MentalDeckMessageType.SHUFFLE]: chain,
        [MentalDeckMessageType.LOCK]: chain,
        [MentalDeckMessageType.KEYS]: chain,
        [MentalDeckMessageType.DISCLOSE]: chain,
    };
}
