import { Component, computed, input } from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatError } from '@angular/material/form-field';
import { TranslocoPipe } from '@jsverse/transloco';
import { fieldError } from '@app/modules/form/field-error';
import { TranslatableText } from '@app/types/translatable-text.type';

/** An option of a choice field: its value, and the key of its label */
export interface ChoiceOption {
    readonly value: string;
    readonly label: Readonly<TranslatableText>;
}

let nextId: number = 0;

/**
 * A choice field of the app: one option among a few, as a group of toggle buttons bound to a field of Signal Forms (the
 * group is a value accessor), its label a legend. A screen reader tells a group of radio buttons
 */
@Component({
    selector: 'app-choice-field',
    imports: [MatButtonToggleGroup, MatButtonToggle, MatError, FormField, TranslocoPipe],
    templateUrl: './choice-field.component.html',
    host: {
        class: 'block',
    },
})
export class ChoiceFieldComponent {
    /** Translated */
    public readonly label = input.required<string>();
    public readonly field = input.required<FieldTree<string>>();
    public readonly options = input.required<ReadonlyArray<Readonly<ChoiceOption>>>();

    protected readonly legendId: string = `choice-field-${ ++nextId }`;
    protected readonly errorId: string = `${ this.legendId }-error`;
    /** The first error of the field once touched, translated by the template */
    protected readonly error = computed<TranslatableText | undefined>(() => (this.field()().touched() ? fieldError(this.field()) : undefined));
}
