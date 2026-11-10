import { Component, computed, input } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { fieldError } from '@app/modules/form/field-error';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The error of a group of fields of a form, its rule given to the group itself in the schema (a total over several
 * fields): the message of its first error, once one of its fields is touched or the form submitted, as a field shows
 * its own, on a line kept while there is none. The errors of the fields inside it show in each field
 */
@Component({
    selector: 'app-form-error',
    imports: [TranslocoPipe],
    templateUrl: './form-error.component.html',
    host: {
        class: 'block',
    },
})
export class FormErrorComponent {
    /** The group: its own errors only */
    public readonly field = input.required<FieldTree<unknown>>();

    /** The first error of the group once touched, translated by the template */
    protected readonly error = computed<TranslatableText | undefined>(() => (this.field()().touched() ? fieldError(this.field()) : undefined));
}
