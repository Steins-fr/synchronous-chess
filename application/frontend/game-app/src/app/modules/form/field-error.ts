import { FieldTree, ValidationError } from '@angular/forms/signals';
import { TranslatableText } from '@app/types/translatable-text.type';
import { marker } from '@jsverse/transloco-keys-manager/marker';

/**
 * The first error of a field of a form component: its message, the key of its translation given by the rule of the
 * schema, with the values of the error as params (the limit of a length). A value the browser could not read (letters in
 * a number field) gives an error of its own, without message
 */
export function fieldError<T>(field: FieldTree<T>): TranslatableText | undefined {
    return errorText(field().errors()[0]);
}

/**
 * The first error among the fields of a group touched, the group itself included: for a form telling the errors of fields
 * showing no message of their own (the stake fields, the choice areas) on one line
 */
export function touchedError(field: FieldTree<unknown>): TranslatableText | undefined {
    return errorText(field().errorSummary().find((error: ValidationError.WithFieldTree) => error.fieldTree().touched()));
}

/** The message of an error of a field, none without error */
function errorText(error: ValidationError.WithFieldTree | undefined): TranslatableText | undefined {
    if (error?.message === undefined) {
        return error && { key: marker('form.unreadable') };
    }
    return { key: error.message, params: { ...error } };
}
