import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { Component, computed, input } from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatableText } from '@app/types/translatable-text.type';
import { fieldError } from '@app/modules/form/field-error';

/**
 * A text area of the app, as TextFieldComponent: a Material form field, outlined, holding a text area bound to a field
 * of Signal Forms. It grows with its text, up to its most rows, then scrolls. Its error takes no room until it shows
 */
@Component({
    selector: 'app-text-area-field',
    imports: [MatFormField, MatLabel, MatError, MatInput, CdkTextareaAutosize, FormField, TranslocoPipe],
    templateUrl: './text-area-field.component.html',
    host: {
        class: 'block',
    },
})
export class TextAreaFieldComponent {
    /** Translated */
    public readonly label = input.required<string>();
    public readonly field = input.required<FieldTree<string>>();
    /** The rows shown at most, before the text scrolls */
    public readonly maxRows = input<number>(5);

    /** The first error of the field, translated by the template */
    protected readonly error = computed<TranslatableText | undefined>(() => fieldError(this.field()));
}
