import { Component, computed, ElementRef, inject, input, linkedSignal, Signal } from '@angular/core';
import { CHIP_VALUES, ChipValue, chipsOf } from '@app/modules/playing-cards/types/chip';

/** A chip of a stack, in the pile of its value */
interface StackedChip {
    /** Its value and its level in its pile: a chip stays while its pile keeps as many chips */
    readonly id: string;
    readonly value: ChipValue;
    /** The classes of its face and of the stripes of its edge */
    readonly colors: string;
    /** The pile of its value, the highest value first */
    readonly pile: number;
    /** Its height in its pile, from 0 */
    readonly level: number;
}

/** The face and the stripes of the edge of a chip of each value */
const CHIP_COLORS: Readonly<Record<ChipValue, string>> = {
    [ChipValue.ONE]: 'bg-app-chip-1 border-app-chip-1-edge',
    [ChipValue.FIVE]: 'bg-app-chip-5 border-app-chip-5-edge',
    [ChipValue.TWENTY_FIVE]: 'bg-app-chip-25 border-app-chip-25-edge',
    [ChipValue.HUNDRED]: 'bg-app-chip-100 border-app-chip-100-edge',
};

/**
 * An amount as piles of chips, the fewest chips making it, a pile for each value. Decorative: the page writes the amount.
 *
 * A chip joining a growing stack drops on its pile once the chips the page moves to it reached it, a chip leaving it
 * fades out: the page shows the chips moved from a stack to another one. The change a stack makes shows at once.
 */
@Component({
    selector: 'app-chip-stack',
    templateUrl: './chip-stack.component.html',
    styleUrl: './chip-stack.component.scss',
    host: { 'class': 'inline-grid items-end pt-[0.6rem]', 'aria-hidden': 'true', '[class.still]': '!placed() || !growing()' },
})
export class ChipStackComponent {
    public readonly amount = input.required<number>();
    /** Whether a chip joining the stack drops on it: not the chips moving from a stack to another one */
    public readonly placed = input<boolean>(true);
    /** Where the stack lies in the page, for the chips moved to it */
    public readonly element: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    /** Whether the amount grew: the chips joining a stack paying out are its change */
    private readonly growing: Signal<boolean> = linkedSignal<number, boolean>({
        source: this.amount,
        computation: (amount: number, previous?: { source: number }): boolean => previous !== undefined && amount > previous.source,
    });

    protected readonly chips: Signal<ReadonlyArray<Readonly<StackedChip>>> = computed((): ReadonlyArray<Readonly<StackedChip>> => {
        const chips: ReadonlyArray<ChipValue> = chipsOf(this.amount());

        return chips.map((value: ChipValue, index: number): StackedChip => {
            const level: number = index - chips.indexOf(value);
            return { id: `${ value }:${ level }`, value, colors: CHIP_COLORS[value], pile: CHIP_VALUES.indexOf(value) + 1, level };
        });
    });
}
