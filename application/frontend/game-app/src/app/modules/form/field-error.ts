import { FieldTree, ValidationError } from '@angular/forms/signals';
import { TranslatableText } from '@app/types/translatable-text.type';

/**
 * The first error of a field of a form component: its message, the key of its translation given by the rule of the
 * schema, with the values of the error as params (the limit of a length)
 */
export function fieldError(field: FieldTree<string>): TranslatableText | undefined {
    const error: ValidationError.WithFieldTree | undefined = field().errors()[0];
    return error && { key: error.message as string, params: { ...error } };
}
