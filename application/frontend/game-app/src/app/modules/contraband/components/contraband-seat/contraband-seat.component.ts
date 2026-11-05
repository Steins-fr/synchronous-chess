import { Component, ElementRef, inject, input, output, Signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';

/** The part of a player in the game in progress */
export enum CustomsRole {
    SMUGGLER = 'smuggler',
    INSPECTOR = 'inspector',
}

/**
 * A seat of the table: its player, its part in the game in progress, the money left in its ATM, in chips, and on its
 * account of the third country. The seat the game waits for is outlined; at the end, the balance of its player
 */
@Component({
    selector: 'app-contraband-seat',
    templateUrl: './contraband-seat.component.html',
    imports: [ChipStackComponent, MatButtonModule, TranslocoDirective, TranslocoPipe],
    host: {
        class: 'table-seat',
        '[id]': '"seat-" + seat()',
        '[class.outline-2]': 'awaited()',
        '[class.outline-app-accent-text]': 'awaited()',
    },
})
export class ContrabandSeatComponent {
    public readonly seat = input.required<number>();
    /** Its player, null for a free seat */
    public readonly name = input.required<string | null>();
    /** The game waits for its player */
    public readonly awaited = input<boolean>(false);
    /** Its player let a phase close without acting */
    public readonly absent = input<boolean>(false);
    /** The part of its player in the game in progress */
    public readonly role = input<CustomsRole | null>(null);
    /** The money left in the ATM of its player, in millions: none out of a match */
    public readonly atm = input<number | null>(null);
    /** The money on the account of its player in the third country */
    public readonly account = input<number | null>(null);
    /** The time left to its player */
    public readonly clock = input<TranslatableText | null>(null);
    public readonly clockLow = input<boolean>(false);
    /** What its player won or lost, once the match is over */
    public readonly balance = input<TranslatableText | null>(null);
    /** The country of its player won */
    public readonly winning = input<boolean>(false);
    public readonly canTake = input<boolean>(false);
    public readonly canLeave = input<boolean>(false);
    public readonly canRelease = input<boolean>(false);
    public readonly take = output<void>();
    public readonly leave = output<void>();
    public readonly release = output<void>();

    private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
    private readonly accountView: Signal<ElementRef<HTMLElement> | undefined> = viewChild('accountView');

    /** Where the money of its account lies: the chips moved to it fly there, to the seat itself out of a match */
    public accountPlace(): HTMLElement {
        return this.accountView()?.nativeElement ?? this.host.nativeElement;
    }
}
