import { booleanAttribute, Component, computed, input } from '@angular/core';
import { FieldTree, ValidationError } from '@angular/forms/signals';
import { errorText, fieldError } from '@app/modules/form/field-error';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The error of a group of fields of a form, its rule given to the group itself in the schema (a total over several
 * fields): the message of its first error, once one of its fields is touched or the form submitted, as a field shows
 * its own, on a line kept while there is none. The errors of the fields inside it show in each field, unless the group
 * tells them too (`summary`), for fields showing no message of their own (the stake fields, the choice areas): the first
 * error among the fields touched
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

    /** The group tells the errors of the fields inside it, before its own */
    public readonly summary = input(false, { transform: booleanAttribute });

    /** The first error of the group once touched, translated by the template */
    protected readonly error = computed<TranslatableText | undefined>(() => {
        if (this.summary()) {
            return errorText(this.field()().errorSummary().find((error: ValidationError.WithFieldTree) => error.fieldTree().touched()));
        }
        return this.field()().touched() ? fieldError(this.field()) : undefined;
    });
}
