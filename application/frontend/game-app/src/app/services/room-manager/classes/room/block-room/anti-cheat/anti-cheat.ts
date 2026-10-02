import { signal } from '@angular/core';
import { AntiCheatMessageType, ReceivedAntiCheatMessage } from '@app/services/room-manager/classes/webrtc/messages/anti-cheat-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { Subject } from 'rxjs';
import { ParticipantRegistry } from '../block-chain/participant-registry';
import { CheatFlag, CheatReport, CheatReporting, sequencerCheats } from './cheat-report';

/**
 * Collects the cheats, outside the block chains: the sequencer orders the blocks alone,
 * the other participants watch it and report the cheats they detect to everyone.
 * A cheat reported by several participants is all the more certain.
 */
export class AntiCheat {
    private readonly _flags = signal<ReadonlyArray<Readonly<CheatFlag>>>([]);
    public readonly flags = this._flags.asReadonly();
    /** Emits on each new report, of the local participant or of another one */
    private readonly reportedSubject = new Subject<void>();
    public readonly reported$ = this.reportedSubject.asObservable();

    public constructor(private readonly participants: ParticipantRegistry) {}

    /** A cheat detected by the local participant, reported to the others */
    public report(report: CheatReport): void {
        if (this.flag(this.participants.local.name, report)) {
            this.participants.broadcast({ type: AntiCheatMessageType.CHEAT_REPORT, payload: report, origin: MessageOriginType.ANTI_CHEAT });
        }
    }

    /** A cheat reported by another participant, known by its connection */
    public handle(message: ReceivedAntiCheatMessage): void {
        this.flag(message.from, message.payload);
    }

    /** The participants who reported a cheat only a sequencer can commit */
    public accusersOf(sequencer: string): ReadonlySet<string> {
        const accusers = new Set<string>();

        for (const flag of this._flags()) {
            if (flag.sequencer === sequencer) {
                flag.reports
                    .filter((reporting: Readonly<CheatReporting>) => sequencerCheats.has(reporting.reason))
                    .forEach((reporting: Readonly<CheatReporting>) => accusers.add(reporting.reporter));
            }
        }

        return accusers;
    }

    /** @returns whether the report is new */
    private flag(reporter: string, report: CheatReport): boolean {
        const { reason, ...subject } = report;
        const reporting: CheatReporting = { reporter, reason };
        const flags: ReadonlyArray<Readonly<CheatFlag>> = this._flags();
        const flag: Readonly<CheatFlag> | undefined = flags.find((existing: Readonly<CheatFlag>) => existing.chain === subject.chain && existing.subject === subject.subject);

        if (flag?.reports.some((existing: Readonly<CheatReporting>) => existing.reporter === reporter && existing.reason === reason)) {
            return false;
        }

        this._flags.set(flag
            ? flags.map((existing: Readonly<CheatFlag>) => existing === flag ? { ...flag, reports: [...flag.reports, reporting] } : existing)
            : [...flags, { ...subject, reports: [reporting] }]);
        this.reportedSubject.next();

        return true;
    }

    public clear(): void {
        this._flags.set([]);
        this.reportedSubject.complete();
    }
}
