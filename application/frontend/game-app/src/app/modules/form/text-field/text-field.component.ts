import { Component, input } from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

/**
 * A text field of the app: a Material form field, outlined, holding a text input bound to a field of Signal Forms.
 * The field is bound to the input itself ([formField]): Material reads its state from the control Signal Forms gives
 * it, the asterisk of a required field and the error state of an invalid touched one included.
 */
@Component({
    selector: 'app-text-field',
    imports: [MatFormField, MatLabel, MatError, MatInput, FormField],
    templateUrl: './text-field.component.html',
    host: {
        class: 'block',
    },
})
export class TextFieldComponent {
    public readonly label = input.required<string>();
    public readonly field = input.required<FieldTree<string>>();
}
