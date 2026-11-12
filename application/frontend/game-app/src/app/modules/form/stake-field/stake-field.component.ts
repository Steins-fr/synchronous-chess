import { Component, computed, input } from '@angular/core';
import { FieldState, FieldTree, FormField } from '@angular/forms/signals';

/**
 * A stake typed on the cloth of a table: a compact number input bound to a field of Signal Forms, sunk in the cloth
 * rather than outlined as the number field, its label read by a screen reader only. Two buttons step its value for a
 * pointer, the arrows of the keyboard doing it for the input. It shows no message: the form tells the error of its
 * stakes on a line of its own (the form error), the field only marked
 */
@Component({
    selector: 'app-stake-field',
    imports: [FormField],
    templateUrl: './stake-field.component.html',
    styleUrl: './stake-field.component.scss',
    host: {
        'class': 'stake-field inline-flex items-stretch h-9 sm:h-11 sm:text-lg rounded-full bg-app-felt-inset text-app-on-color',
        '[class.stake-invalid]': 'invalid()',
    },
})
export class StakeFieldComponent {
    /** Translated */
    public readonly label = input.required<string>();
    /** Its value is null while the field is empty */
    public readonly field = input.required<FieldTree<number | null>>();
    /** The form the input belongs to, when it lies out of it */
    public readonly formId = input<string | null>(null);
    /** What a button adds to the stake, or takes from it */
    public readonly step = input<number>(5);

    /** The field holds an error, once touched */
    protected readonly invalid = computed<boolean>(() => this.field()().touched() && this.field()().invalid());

    /** A button steps the stake, never below 0 */
    protected change(direction: number): void {
        const state: FieldState<number | null> = this.field()();
        state.value.set(Math.max(0, (state.value() ?? 0) + direction * this.step()));
        state.markAsTouched();
    }
}
