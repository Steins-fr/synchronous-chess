import { signal } from '@angular/core';
import { AntiCheatMessageType, ReceivedAntiCheatMessage } from '@app/services/room-manager/classes/webrtc/messages/anti-cheat-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { ParticipantRegistry } from '../block-chain/participant-registry';
import { CheatFlag, CheatReport, CheatReporting } from './cheat-report';

/**
 * Collects the blocks detected as cheated, outside the block chains: the sequencer orders the blocks alone,
 * the other participants check each block they add to their chain and report the cheats to everyone.
 * A block reported by several participants is all the more certainly cheated.
 */
export class AntiCheat {
    private readonly _flags = signal<ReadonlyArray<Readonly<CheatFlag>>>([]);
    public readonly flags = this._flags.asReadonly();

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

    /** @returns whether the report is new */
    private flag(reporter: string, report: CheatReport): boolean {
        const { reason, ...block } = report;
        const reporting: CheatReporting = { reporter, reason };
        const flags: ReadonlyArray<Readonly<CheatFlag>> = this._flags();
        const flag: Readonly<CheatFlag> | undefined = flags.find((existing: Readonly<CheatFlag>) => existing.chain === block.chain && existing.hash === block.hash);

        if (flag?.reports.some((existing: Readonly<CheatReporting>) => existing.reporter === reporter && existing.reason === reason)) {
            return false;
        }

        this._flags.set(flag
            ? flags.map((existing: Readonly<CheatFlag>) => existing === flag ? { ...flag, reports: [...flag.reports, reporting] } : existing)
            : [...flags, { ...block, reports: [reporting] }]);

        return true;
    }

    public clear(): void {
        this._flags.set([]);
    }
}
