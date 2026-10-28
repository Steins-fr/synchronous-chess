import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { PastResult } from '@app/modules/room-layout/room-history/past-result';
import { TranslatableText } from '@app/types/translatable-text.type';

/** The text as the player reads it, in the language of the specs */
export function translated(text: TranslatableText): string {
    return TestBed.inject(TranslocoService).translate(text.key, text.params);
}

/** The line of a former match or game, as the history of the room shows it: its number, its result, then its check */
export function pastLine(result: Readonly<PastResult>): string {
    return [result.label, result.text, result.verification]
        .filter((text: TranslatableText | null): text is TranslatableText => text !== null)
        .map((text: TranslatableText) => translated(text))
        .join(' ');
}
