import { Room } from '@app/services/room-manager/classes/room/room';
import { merge, Subscription } from 'rxjs';
import { MentalDeckMessage, MentalDeckMessageType, MentalDeckPayloads } from '../mental-deck-messages';
import { MentalDeck, MentalDeckOptions } from './mental-deck';

/**
 * The decks of a game, receiving their messages from the start of the game session: the game handles its messages one
 * after the other, awaiting its decks, so the messages of a deck may come before the game creates it. They wait for it,
 * then reach it in the order of the chain. The chain keeps every message already: waiting costs nothing more.
 */
export class MentalDeckTable {
    private readonly decks = new Map<string, MentalDeck>();
    /** The messages of the decks not created yet, by deck */
    private readonly waiting = new Map<string, MentalDeckMessage[]>();
    private readonly subscription: Subscription;

    public constructor(private readonly room: Room<MentalDeckPayloads>) {
        this.subscription = merge(
            room.messenger(MentalDeckMessageType.SHUFFLE),
            room.messenger(MentalDeckMessageType.LOCK),
            room.messenger(MentalDeckMessageType.KEYS),
            room.messenger(MentalDeckMessageType.DISCLOSE),
        ).subscribe((message: MentalDeckMessage) => this.dispatch(message));
    }

    /** Creates a deck, its messages received meanwhile applying at once */
    public deck(options: Readonly<MentalDeckOptions>): MentalDeck {
        if (this.decks.has(options.id)) {
            throw new Error(`The deck ${ options.id } exists already`);
        }

        const deck = new MentalDeck(this.room, options, this.waiting.get(options.id));
        this.decks.set(options.id, deck);
        this.waiting.delete(options.id);
        return deck;
    }

    public destroy(): void {
        this.subscription.unsubscribe();
        this.decks.forEach((deck: MentalDeck) => deck.destroy());
    }

    private dispatch(message: MentalDeckMessage): void {
        const id: unknown = (message.payload as Partial<MentalDeckMessage['payload']> | null)?.deck;

        if (typeof id !== 'string') {
            return;
        }

        const deck: MentalDeck | undefined = this.decks.get(id);

        if (deck) {
            deck.receive(message);
        } else {
            const waiting: MentalDeckMessage[] = this.waiting.get(id) ?? [];
            waiting.push(message);
            this.waiting.set(id, waiting);
        }
    }
}
