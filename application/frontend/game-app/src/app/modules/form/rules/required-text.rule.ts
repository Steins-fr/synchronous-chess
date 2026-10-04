import { PathKind, required, requiredError, SchemaPath, SchemaPathRules, validate } from '@angular/forms/signals';

/**
 * Requires a text: neither empty nor made of spaces only, both failing with the message given. Its field is required
 * (the asterisk of Material), and a text of spaces only gets the error required gives an empty one.
 */
export function requiredText<TPathKind extends PathKind = PathKind.Root>(
    path: SchemaPath<string, SchemaPathRules.Supported, TPathKind>,
    message: string,
): void {
    required(path, { message });
    validate(path, ({ value }) => (value() !== '' && value().trim() === '' ? requiredError({ message }) : undefined));
}
