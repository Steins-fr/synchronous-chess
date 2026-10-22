import { Component } from '@angular/core';
import { CardHandComponent, HandCard } from '@app/modules/playing-cards/components/card-hand/card-hand.component';
import { CardRank, CardSuit, JOKER } from '@app/modules/playing-cards/types/playing-card';
import { TranslocoDirective } from '@jsverse/transloco';

/** Presents the game before joining a room */
@Component({
    selector: 'app-poker-presentation',
    templateUrl: './poker-presentation.component.html',
    imports: [CardHandComponent, TranslocoDirective],
})
export class PokerPresentationComponent {
    /** The best hand of the game: the four aces and the joker */
    protected readonly bestHand: ReadonlyArray<Readonly<HandCard>> = [
        ...Object.values(CardSuit).map((suit: CardSuit): HandCard => ({ id: suit, card: { rank: CardRank.ACE, suit } })),
        { id: JOKER, card: JOKER },
    ];
}
