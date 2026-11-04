import { PathKind, SchemaPath, SchemaPathRules, validate } from '@angular/forms/signals';
import { holdsLink } from '@app/helpers/link.helper';

/**
 * Refuses a text holding a link or an e-mail address, with the message given, the key of its translation: no page shows
 * one sent by another player
 */
export function noLink<TPathKind extends PathKind = PathKind.Root>(
    path: SchemaPath<string, SchemaPathRules.Supported, TPathKind>,
    message: string,
): void {
    validate(path, ({ value }) => (holdsLink(value()) ? { kind: 'link', message } : undefined));
}
