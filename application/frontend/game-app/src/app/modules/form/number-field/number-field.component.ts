import { Component, computed, input } from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatableText } from '@app/types/translatable-text.type';
import { fieldError } from '@app/modules/form/field-error';

/**
 * A number field of the app: a Material form field, outlined, holding a number input bound to a field of Signal Forms,
 * as the text field does. A phone shows its keypad of digits.
 */
@Component({
    selector: 'app-number-field',
    imports: [MatFormField, MatLabel, MatError, MatInput, FormField, TranslocoPipe],
    templateUrl: './number-field.component.html',
    host: {
        class: 'block',
    },
})
export class NumberFieldComponent {
    /** Translated */
    public readonly label = input.required<string>();
    /** Its value is null while the field is empty */
    public readonly field = input.required<FieldTree<number | null>>();

    /** The first error of the field, translated by the template */
    protected readonly error = computed<TranslatableText | undefined>(() => fieldError(this.field()));
}
