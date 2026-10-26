import { Component, computed, input, model, Signal } from '@angular/core';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';

/** What a chamber shows */
export enum ChamberState {
    /** Not fired: no one knows what it holds */
    HIDDEN = 'hidden',
    /** A chamber the local player loads, before the spins */
    LOADED = 'loaded',
    EMPTY = 'empty',
    /** Fired, a bullet in it: one death, whether one player loaded it or both */
    BULLET = 'bullet',
    DOUBLE = 'double',
}

/** The label of a chamber in each state, for a screen reader */
const CHAMBER_LABELS: Readonly<Record<ChamberState, string>> = {
    [ChamberState.HIDDEN]: scopedKey(TranslationScope.ROULETTE, marker('cylinder.hidden', undefined, 'roulette')),
    [ChamberState.LOADED]: scopedKey(TranslationScope.ROULETTE, marker('cylinder.loaded', undefined, 'roulette')),
    [ChamberState.EMPTY]: scopedKey(TranslationScope.ROULETTE, marker('cylinder.empty', undefined, 'roulette')),
    [ChamberState.BULLET]: scopedKey(TranslationScope.ROULETTE, marker('cylinder.bullet', undefined, 'roulette')),
    [ChamberState.DOUBLE]: scopedKey(TranslationScope.ROULETTE, marker('cylinder.double', undefined, 'roulette')),
};

interface ChamberView {
    readonly index: number;
    /** Its angle on the cylinder, from the top, clockwise */
    readonly angle: number;
    readonly state: ChamberState;
    readonly label: string;
}

/**
 * The cylinder of the revolver, seen from its end, its chambers around it. While the local player places its bullets,
 * its chambers are buttons; then the cylinder turns at each shot, the chamber to fire under the hammer at the top, the
 * chambers fired telling their bullets
 */
@Component({
    selector: 'app-roulette-cylinder',
    templateUrl: './roulette-cylinder.component.html',
    styleUrl: './roulette-cylinder.component.scss',
    imports: [TranslocoDirective, TranslocoPipe],
    host: { 'class': 'block', '[class.compact]': 'compact()' },
})
export class RouletteCylinderComponent {
    public readonly chambers = input.required<number>();
    /** The local player places its bullets: each chamber is a button */
    public readonly selectable = input<boolean>(false);
    /** The chambers selected for the bullets */
    public readonly selected = model<ReadonlyArray<number>>([]);
    /** The bullets of the local player: no more chambers are selected */
    public readonly bullets = input<number>(0);
    /** The chambers the local player loaded, shown until the cylinder is spun */
    public readonly loaded = input<ReadonlyArray<number>>([]);
    /** The bullets of each chamber fired, in their order */
    public readonly fired = input<ReadonlyArray<number>>([]);
    /** The players load and spin the cylinder */
    public readonly spinning = input<boolean>(false);
    /** The cylinder spun lies beside the revolver, twice its height */
    public readonly compact = input<boolean>(false);

    protected readonly state: typeof ChamberState = ChamberState;

    protected readonly views: Signal<ReadonlyArray<ChamberView>> = computed((): ReadonlyArray<ChamberView> => {
        const [selected, loaded, fired] = [this.selected(), this.loaded(), this.fired()];
        return Array.from({ length: this.chambers() }, (_, index: number): ChamberView => {
            const unfired: ChamberState = selected.includes(index) || loaded.includes(index) ? ChamberState.LOADED : ChamberState.HIDDEN;
            const state: ChamberState = index < fired.length ? RouletteCylinderComponent.firedState(fired[index]) : unfired;
            return { index, angle: index * 360 / this.chambers(), state, label: CHAMBER_LABELS[state] };
        });
    });

    /** The cylinder turns at each shot: the next chamber comes under the hammer */
    protected readonly turn: Signal<number> = computed((): number => -this.fired().length * 360 / this.chambers());
    protected readonly full: Signal<boolean> = computed((): boolean => this.selected().length >= this.bullets());

    private static firedState(bullets: number): ChamberState {
        if (bullets === 0) {
            return ChamberState.EMPTY;
        }
        return bullets === 1 ? ChamberState.BULLET : ChamberState.DOUBLE;
    }

    protected toggle(index: number): void {
        const selected: ReadonlyArray<number> = this.selected();
        if (selected.includes(index)) {
            this.selected.set(selected.filter((chamber: number) => chamber !== index));
        } else if (!this.full()) {
            this.selected.set([...selected, index].sort((one: number, other: number) => one - other));
        }
    }
}
