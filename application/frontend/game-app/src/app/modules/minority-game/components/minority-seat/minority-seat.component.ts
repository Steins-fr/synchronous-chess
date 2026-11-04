import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { Vote } from '../../classes/rules/minority-rules';

/**
 * A seat of the table: its player, the vote it revealed on the question before, its points in the score variant. The
 * seat the game waits for is outlined; a vote sealed is told, never its value. An eliminated player shows faded
 */
@Component({
    selector: 'app-minority-seat',
    templateUrl: './minority-seat.component.html',
    imports: [MatButtonModule, TranslocoDirective, TranslocoPipe],
    host: {
        class: 'table-seat',
        '[id]': '"seat-" + seat()',
        '[class.outline-2]': 'awaited()',
        '[class.outline-app-accent-text]': 'awaited()',
    },
})
export class MinoritySeatComponent {
    public readonly seat = input.required<number>();
    /** Its player, null for a free seat */
    public readonly name = input.required<string | null>();
    /** The game waits for its player */
    public readonly awaited = input<boolean>(false);
    /** Its player sealed its vote */
    public readonly sealed = input<boolean>(false);
    /** Its player let a phase close without acting */
    public readonly absent = input<boolean>(false);
    /** Its player asks the question */
    public readonly asker = input<boolean>(false);
    public readonly eliminated = input<boolean>(false);
    /** The vote its player revealed on the question before */
    public readonly vote = input<Vote | null>(null);
    /** The points of its player, in the score variant */
    public readonly points = input<number | null>(null);
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
