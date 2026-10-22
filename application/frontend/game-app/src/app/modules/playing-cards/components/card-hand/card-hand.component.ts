import { Component, input, linkedSignal, model, WritableSignal } from '@angular/core';
import { PlayingCardComponent } from '@app/modules/playing-cards/components/playing-card/playing-card.component';
import { PlayingCard } from '@app/modules/playing-cards/types/playing-card';

/**
 * A card of a hand. Its id follows the card while it stays in the hand, and differs from the ids of the cards of the
 * other deals: the id of the deck and the position of the card in it, for one
 */
export interface HandCard {
    readonly id: string;
    /** The card, null while it is face down */
    readonly card: PlayingCard | null;
}

/**
 * The cards of a hand, in a fan. The cards entering the hand are dealt one after the other, in the order of the hand; a
 * card leaving it is thrown away. Selectable, each card is a button toggling its selection, lifted out of the fan: the
 * page clears the selection it acted on.
 */
@Component({
    selector: 'app-card-hand',
    templateUrl: './card-hand.component.html',
    styleUrl: './card-hand.component.scss',
    imports: [PlayingCardComponent],
    host: { class: 'block' },
})
export class CardHandComponent {
    public readonly cards = input.required<ReadonlyArray<Readonly<HandCard>>>();
    /** Whether the player selects cards of the hand */
    public readonly selectable = input<boolean>(false);
    /** The ids of the cards of the hand winning the pot */
    public readonly highlighted = input<ReadonlyArray<string>>([]);
    /** The ids of the cards selected */
    public readonly selected = model<ReadonlyArray<string>>([]);

    /** The order in which each card entering the hand is dealt, by id: the cards staying in it have none */
    protected readonly dealOrder: WritableSignal<ReadonlyMap<string, number>> = linkedSignal({
        source: this.cards,
        computation: (cards: ReadonlyArray<Readonly<HandCard>>, previous?: { source: ReadonlyArray<Readonly<HandCard>> }): ReadonlyMap<string, number> => {
            const held: ReadonlySet<string> = new Set<string>(previous?.source.map((card: Readonly<HandCard>) => card.id));
            const entering: ReadonlyArray<Readonly<HandCard>> = cards.filter((card: Readonly<HandCard>) => !held.has(card.id));
            return new Map<string, number>(entering.map((card: Readonly<HandCard>, order: number): [string, number] => [card.id, order]));
        },
    });

    /** The place of a card from the middle of the fan, negative on its left */
    protected fanOffset(index: number): number {
        return index - (this.cards().length - 1) / 2;
    }

    protected toggle(id: string): void {
        this.selected.update((selected: ReadonlyArray<string>) => selected.includes(id) ? selected.filter((selectedId: string) => selectedId !== id) : [...selected, id]);
    }
}
