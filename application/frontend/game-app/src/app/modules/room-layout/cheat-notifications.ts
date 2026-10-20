import { effect, inject } from '@angular/core';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { NotificationService } from '@app/services/notification/notification.service';
import { CheatFlag, CheatReporting } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { TranslatableText } from '@app/types/translatable-text.type';

// The chain is a code, named by the translation
function describe(flag: Readonly<CheatFlag>): TranslatableText {
    const reporters: string = flag.reports.map((report: Readonly<CheatReporting>) => report.reporter).join(', ');
    const params = { chain: flag.chain, author: flag.author, reporters };

    // An entry the sequencer does not order has no index
    if (flag.index === undefined) {
        return { key: marker('cheat.ignored'), params: { ...params, sequencer: flag.sequencer } };
    }

    return { key: marker('cheat.flagged'), params: { ...params, index: flag.index } };
}

/**
 * Notifies each new report of a cheat, to call in an injection context
 * @param flags the cheat flags of the room, once it is built
 */
export function notifyCheatFlags(flags: () => ReadonlyArray<Readonly<CheatFlag>> | undefined): void {
    const notificationService: NotificationService = inject(NotificationService);
    const notifiedReports = new Map<string, number>();

    effect(() => {
        for (const flag of flags() ?? []) {
            const key: string = `${ flag.chain } ${ flag.subject }`;

            if (flag.reports.length > (notifiedReports.get(key) ?? 0)) {
                notifiedReports.set(key, flag.reports.length);
                notificationService.error(describe(flag));
            }
        }
    });
}
