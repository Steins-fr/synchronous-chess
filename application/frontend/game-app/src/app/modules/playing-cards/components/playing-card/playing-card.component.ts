import { Component, computed, input, Signal } from '@angular/core';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { TranslatableText } from '@app/types/translatable-text.type';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { CardRank, CardSuit, JOKER, PlayingCard, SuitedCard } from '@app/modules/playing-cards/types/playing-card';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';

/** The pip of each suit, drawn in a box of 100 by 100 */
const SUIT_PATHS: Readonly<Record<CardSuit, string>> = {
    [CardSuit.SPADES]: 'M50 2C62 22 98 40 98 62C98 78 86 88 72 88C63 88 56 83 53 76C54 86 58 93 66 98H34C42 93 46 86 47 76C44 83 37 88 28 88C14 88 2 78 2 62C2 40 38 22 50 2Z',
    [CardSuit.HEARTS]: 'M50 96C38 82 2 60 2 32C2 14 15 4 29 4C39 4 46 10 50 18C54 10 61 4 71 4C85 4 98 14 98 32C98 60 62 82 50 96Z',
    [CardSuit.DIAMONDS]: 'M50 2L86 50L50 98L14 50Z',
    [CardSuit.CLUBS]: 'M30 28a20 20 0 1 0 40 0a20 20 0 1 0 -40 0ZM7 58a20 20 0 1 0 40 0a20 20 0 1 0 -40 0ZM53 58a20 20 0 1 0 40 0a20 20 0 1 0 -40 0ZM38 52a12 12 0 1 0 24 0a12 12 0 1 0 -24 0ZM46 60Q45 85 32 98H68Q55 85 54 60Z',
};

const RED_SUITS: ReadonlySet<CardSuit> = new Set<CardSuit>([CardSuit.HEARTS, CardSuit.DIAMONDS]);

/** A star of 5 branches, the mark of the joker, in a box of 100 by 100 */
const JOKER_STAR: string = `M${ Array.from({ length: 10 }, (_: unknown, point: number): string => {
    const radius: number = point % 2 === 0 ? 50 : 21;
    const angle: number = Math.PI * (point / 5 - 0.5);
    return `${ (50 + radius * Math.cos(angle)).toFixed(1) } ${ (52 + radius * Math.sin(angle)).toFixed(1) }`;
}).join('L') }Z`;

/** The diamonds of the back, every other one of a grid inside its frame */
const BACK_PATTERN: string = Array.from({ length: 8 * 11 }, (_: unknown, cell: number): string => {
    const column: number = cell % 8;
    const row: number = Math.floor(cell / 8);
    return (column + row) % 2 === 0 ? `M${ 14 + 10 * column } ${ 9.5 + 11 * row }l4.5 5.5l-4.5 5.5l-4.5 -5.5Z` : '';
}).join('');

/**
 * A playing card, face down until its card is known: it then turns over to its face. Its name is the label of an image,
 * for the screen readers
 */
@Component({
    selector: 'app-playing-card',
    templateUrl: './playing-card.component.html',
    imports: [TranslocoDirective, TranslocoPipe],
    host: { class: 'block w-(--app-card-width) aspect-[5/7] perspective-[40rem]' },
})
export class PlayingCardComponent {
    /** The card, null while it is face down */
    public readonly card = input.required<PlayingCard | null>();
    /** A card of the hand winning the pot */
    public readonly highlighted = input<boolean>(false);

    protected readonly ace: CardRank = CardRank.ACE;
    protected readonly suitPaths: Readonly<Record<CardSuit, string>> = SUIT_PATHS;
    protected readonly jokerStar: string = JOKER_STAR;
    protected readonly backPattern: string = BACK_PATTERN;

    protected readonly suited: Signal<SuitedCard | null> = computed((): SuitedCard | null => {
        const card: PlayingCard | null = this.card();
        return card === null || card === JOKER ? null : card;
    });

    /** The name of the card, for the screen readers */
    protected readonly label: Signal<TranslatableText> = computed((): TranslatableText => {
        const card: PlayingCard | null = this.card();

        if (card === null) {
            return { key: scopedKey(TranslationScope.CARDS, marker('hidden', undefined, 'cards')) };
        }

        return card === JOKER
            ? { key: scopedKey(TranslationScope.CARDS, marker('joker', undefined, 'cards')) }
            : { key: scopedKey(TranslationScope.CARDS, marker('name', undefined, 'cards')), params: { rank: card.rank, suit: card.suit } };
    });

    protected readonly red: Signal<boolean> = computed((): boolean => {
        const suited: SuitedCard | null = this.suited();
        return suited !== null && RED_SUITS.has(suited.suit);
    });
}
