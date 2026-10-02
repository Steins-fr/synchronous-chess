import { AntiCheat } from './anti-cheat';
import { CheatReason, CheatReport } from './cheat-report';
import { ParticipantRegistry } from '../block-chain/participant-registry';
import { BlockChainName } from '../block-chain-name.enum';
import { LocalPlayer } from '@app/services/room-manager/classes/player/local-player';
import { Player } from '@app/services/room-manager/classes/player/player';
import { AntiCheatMessageType, ReceivedAntiCheatMessage } from '@app/services/room-manager/classes/webrtc/messages/anti-cheat-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { TestHelper } from '@testing/test.helper';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const report: CheatReport = { chain: BlockChainName.CHESS, subject: 'hash', index: 2, author: 'bob', sequencer: 'host', reason: CheatReason.FORGED_AUTHOR };

function received(cheatReport: CheatReport, from: string): ReceivedAntiCheatMessage<AntiCheatMessageType.CHEAT_REPORT> {
    return { type: AntiCheatMessageType.CHEAT_REPORT, payload: cheatReport, origin: MessageOriginType.ANTI_CHEAT, from };
}

describe('AntiCheat', () => {
    let participants: ParticipantRegistry;
    let remote: Player;
    let antiCheat: AntiCheat;

    beforeAll(async () => {
        participants = new ParticipantRegistry(new LocalPlayer('alice'), await ParticipantRegistry.createKeys());
    });

    beforeEach(() => {
        participants.clear();
        remote = TestHelper.cast<Player>({ name: 'carol', isLocal: false, sendData: vi.fn() });
        participants.onNewPlayer(remote);
        vi.mocked(remote.sendData).mockClear();
        antiCheat = new AntiCheat(participants);
    });

    test('should report the cheats it detects to the other participants, once', () => {
        // When
        antiCheat.report(report);
        antiCheat.report(report);

        // Then
        expect(remote.sendData).toHaveBeenCalledExactlyOnceWith({ type: AntiCheatMessageType.CHEAT_REPORT, payload: report, origin: MessageOriginType.ANTI_CHEAT });
        expect(antiCheat.flags()).toEqual([{
            chain: BlockChainName.CHESS,
            subject: 'hash',
            index: 2,
            author: 'bob',
            sequencer: 'host',
            reports: [{ reporter: 'alice', reason: CheatReason.FORGED_AUTHOR }],
        }]);
    });

    test('should gather the reports of a block from all the participants', () => {
        // Given
        const otherBlock: CheatReport = { ...report, subject: 'other', reason: CheatReason.REPLAYED_ENTRY };
        const otherChain: CheatReport = { ...report, chain: BlockChainName.CHAT };

        // When
        antiCheat.report(report);
        antiCheat.handle(received(report, 'carol'));
        antiCheat.handle(received({ ...report, reason: CheatReason.FORGED_SEQUENCING }, 'carol'));
        antiCheat.handle(received(report, 'carol'));
        antiCheat.handle(received(otherBlock, 'carol'));
        antiCheat.handle(received(otherChain, 'carol'));
        antiCheat.handle(received({ ...otherBlock, reason: CheatReason.FORGED_AUTHOR }, 'dave'));

        // Then
        expect(antiCheat.flags().map((flag) => [flag.chain, flag.subject, flag.reports])).toEqual([
            [BlockChainName.CHESS, 'hash', [
                { reporter: 'alice', reason: CheatReason.FORGED_AUTHOR },
                { reporter: 'carol', reason: CheatReason.FORGED_AUTHOR },
                { reporter: 'carol', reason: CheatReason.FORGED_SEQUENCING },
            ]],
            [BlockChainName.CHESS, 'other', [{ reporter: 'carol', reason: CheatReason.REPLAYED_ENTRY }, { reporter: 'dave', reason: CheatReason.FORGED_AUTHOR }]],
            [BlockChainName.CHAT, 'hash', [{ reporter: 'carol', reason: CheatReason.FORGED_AUTHOR }]],
        ]);
    });

    test('should name the participants who reported a cheat of a sequencer, and notify each new report', () => {
        // Given
        let reports: number = 0;
        antiCheat.reported$.subscribe(() => reports++);

        // When
        antiCheat.report({ ...report, reason: CheatReason.REPLAYED_ENTRY });
        antiCheat.report({ ...report, reason: CheatReason.REPLAYED_ENTRY });
        antiCheat.handle(received({ ...report, subject: 'move', reason: CheatReason.ILLEGAL_MOVE }, 'carol'));
        antiCheat.handle(received({ ...report, subject: 'other', sequencer: 'carol', reason: CheatReason.CENSORED_ENTRY }, 'dave'));

        // Then the cheats of the application do not count against the sequencer
        expect(antiCheat.accusersOf('host')).toEqual(new Set(['alice']));
        expect(antiCheat.accusersOf('carol')).toEqual(new Set(['dave']));
        expect(reports).toEqual(3);
    });

    test('should only count a forged author against the sequencer when its author reports it', () => {
        // When the author of the entry and another participant find it forged
        antiCheat.handle(received(report, 'carol'));
        antiCheat.handle(received({ ...report, subject: 'own' }, 'bob'));

        // Then only the author is sure, the other may have been given another key by the author
        expect(antiCheat.accusersOf('host')).toEqual(new Set(['bob']));
    });

    test('clear should forget the flags', () => {
        // Given
        antiCheat.handle(received(report, 'carol'));

        // When
        antiCheat.clear();

        // Then
        expect(antiCheat.flags()).toEqual([]);
    });
});
