import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatableText } from '@app/types/translatable-text.type';
import { PastResult } from './past-result';

/**
 * The history of a game, in the panel of the room: the moves of the match in progress, then the results of the former
 * ones with their checks, the latest first. Given by the page of a game to its layout (`roomHistory`), it knows nothing of
 * the games
 */
@Component({
    selector: 'app-room-history',
    templateUrl: './room-history.component.html',
    imports: [TranslocoPipe],
    host: {
        class: 'flex min-h-0 flex-1 flex-col gap-4 p-4',
    },
})
export class RoomHistoryComponent {
    /** The title of the moves of the match in progress */
    public readonly currentTitle = input.required<string>();
    /** The moves of the match in progress, the latest first */
    public readonly current = input.required<ReadonlyArray<TranslatableText>>();
    /** The title of the former matches: none for a game played once per room */
    public readonly pastTitle = input<string>();
    /** The results of the former matches, the latest first */
    public readonly past = input<ReadonlyArray<Readonly<PastResult>>>([]);
}
