import { Component, Signal, signal } from '@angular/core';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { TablePoint } from '../../helpers/table-point.helper';

/** Chips flying from a place of the table to another one, once the delay is over */
export interface ChipFlight {
    readonly amount: number;
    readonly from: TablePoint;
    readonly to: TablePoint;
    /** In milliseconds, none by default */
    readonly delay?: number;
}

interface FlyingChips extends ChipFlight {
    readonly id: number;
}

/**
 * The chips moved from a place of a table to another one, flying over it. Its host lays out nothing: the chips fly from
 * the top left corner of the positioned table holding it
 */
@Component({
    selector: 'app-chip-flights',
    templateUrl: './chip-flights.component.html',
    styleUrl: './chip-flights.component.scss',
    imports: [ChipStackComponent],
    host: { class: 'contents' },
})
export class ChipFlightsComponent {
    private readonly _flights = signal<ReadonlyArray<Readonly<FlyingChips>>>([]);
    /** The chips flying, until they land */
    protected readonly flights: Signal<ReadonlyArray<Readonly<FlyingChips>>> = this._flights.asReadonly();
    private nextFlight: number = 0;

    /** The chips take off, the ones still flying landing meanwhile */
    public launch(flights: ReadonlyArray<Readonly<ChipFlight>>): void {
        if (flights.length > 0) {
            this._flights.update((flying: ReadonlyArray<Readonly<FlyingChips>>) => [...flying, ...flights.map((flight: Readonly<ChipFlight>) => ({ ...flight, id: this.nextFlight++ }))]);
        }
    }

    /** Chips flown to their place, or whose flight was cancelled: the animation of a chip inside them ends earlier */
    protected land(id: number, event: Event): void {
        if (event.target === event.currentTarget) {
            this._flights.update((flights: ReadonlyArray<Readonly<FlyingChips>>) => flights.filter((flight: Readonly<FlyingChips>) => flight.id !== id));
        }
    }
}
