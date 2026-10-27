import { Component, computed, input } from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatableText } from '@app/types/translatable-text.type';
import { fieldError } from '@app/modules/form/field-error';

/**
 * A text field of the app: a Material form field, outlined, holding a text input bound to a field of Signal Forms.
 * The field is bound to the input itself ([formField]): Material reads its state from the control Signal Forms gives
 * it, the asterisk of a required field and the error state of an invalid touched one included.
 * The message of an error is the key of its translation, given by the rule of the schema.
 */
@Component({
    selector: 'app-text-field',
    imports: [MatFormField, MatLabel, MatError, MatInput, FormField, TranslocoPipe],
    templateUrl: './text-field.component.html',
    host: {
        class: 'block',
    },
})
export class TextFieldComponent {
    /** Translated */
    public readonly label = input.required<string>();
    public readonly field = input.required<FieldTree<string>>();
    /** A password hides what is typed */
    public readonly type = input<'text' | 'password'>('text');

    /** The first error of the field, translated by the template */
    protected readonly error = computed<TranslatableText | undefined>(() => fieldError(this.field()));
}
