import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { Apple } from '../../classes/rules/eden-rules';
import { Sign } from '../../helpers/eden-texts.helper';
import { EdenAppleComponent } from '../eden-apple/eden-apple.component';

/** An amount of millions as a text reads it */
export interface SignedAmount {
    readonly sign: Sign;
    readonly amount: number;
}

/**
 * A seat of the table: its player, its balance, the apple it revealed on the round before and what it won or lost. The
 * seat the game waits for is outlined; an apple sealed is told, never its color. A player out of paradise shows faded
 */
@Component({
    selector: 'app-eden-seat',
    templateUrl: './eden-seat.component.html',
    imports: [EdenAppleComponent, MatButtonModule, TranslocoDirective, TranslocoPipe],
    host: {
        class: 'table-seat',
        '[id]': '"seat-" + seat()',
        '[class.outline-2]': 'awaited()',
        '[class.outline-app-accent-text]': 'awaited()',
    },
})
export class EdenSeatComponent {
    public readonly seat = input.required<number>();
    /** Its player, null for a free seat */
    public readonly name = input.required<string | null>();
    /** The game waits for its player */
    public readonly awaited = input<boolean>(false);
    /** Its player sealed its apple */
    public readonly sealed = input<boolean>(false);
    /** Its player let a phase close without acting */
    public readonly absent = input<boolean>(false);
    /** Its player lost paradise */
    public readonly out = input<boolean>(false);
    /** The apple its player revealed on the round before */
    public readonly apple = input<Apple | null>(null);
    /** What its player won or lost on the round before */
    public readonly gain = input<Readonly<SignedAmount> | null>(null);
    /** The millions of its player, once the game started */
    public readonly balance = input<Readonly<SignedAmount> | null>(null);
    /** The time left to its player */
    public readonly clock = input<TranslatableText | null>(null);
    public readonly clockLow = input<boolean>(false);
    /** The end of the game for its player */
    public readonly standing = input<TranslatableText | null>(null);
    /** Its player won: the standing of the others shows in the neutral colors */
    public readonly winning = input<boolean>(false);
    public readonly canTake = input<boolean>(false);
    public readonly canLeave = input<boolean>(false);
    public readonly canRelease = input<boolean>(false);
    public readonly take = output<void>();
    public readonly leave = output<void>();
    public readonly release = output<void>();
}
