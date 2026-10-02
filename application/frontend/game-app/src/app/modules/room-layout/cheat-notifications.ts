import { effect, inject } from '@angular/core';
import { NotificationService } from '@app/services/notification/notification.service';
import { CheatFlag, CheatReporting } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';

function describe(flag: Readonly<CheatFlag>): string {
    const reporters: string = flag.reports.map((report: Readonly<CheatReporting>) => report.reporter).join(', ');

    // An entry the sequencer does not order has no index
    if (flag.index === undefined) {
        return `Un message (${ flag.chain }) de ${ flag.author } est ignoré par ${ flag.sequencer }, signalé par ${ reporters }`;
    }

    return `Le message ${ flag.index } (${ flag.chain }) de ${ flag.author } est signalé comme triché par ${ reporters }`;
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
