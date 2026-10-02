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

const report: CheatReport = { chain: BlockChainName.CHESS, index: 2, hash: 'hash', author: 'bob', sequencer: 'host', reason: CheatReason.FORGED_AUTHOR };

function received(cheatReport: CheatReport, from: string): ReceivedAntiCheatMessage {
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
            index: 2,
            hash: 'hash',
            author: 'bob',
            sequencer: 'host',
            reports: [{ reporter: 'alice', reason: CheatReason.FORGED_AUTHOR }],
        }]);
    });

    test('should gather the reports of a block from all the participants', () => {
        // Given
        const otherBlock: CheatReport = { ...report, hash: 'other', reason: CheatReason.REPLAYED_ENTRY };
        const otherChain: CheatReport = { ...report, chain: BlockChainName.CHAT };

        // When
        antiCheat.report(report);
        antiCheat.handle(received(report, 'carol'));
        antiCheat.handle(received({ ...report, reason: CheatReason.FORGED_SEQUENCING }, 'carol'));
        antiCheat.handle(received(report, 'carol'));
        antiCheat.handle(received(otherBlock, 'carol'));
        antiCheat.handle(received(otherChain, 'carol'));

        // Then
        expect(antiCheat.flags().map((flag) => [flag.chain, flag.hash, flag.reports])).toEqual([
            [BlockChainName.CHESS, 'hash', [
                { reporter: 'alice', reason: CheatReason.FORGED_AUTHOR },
                { reporter: 'carol', reason: CheatReason.FORGED_AUTHOR },
                { reporter: 'carol', reason: CheatReason.FORGED_SEQUENCING },
            ]],
            [BlockChainName.CHESS, 'other', [{ reporter: 'carol', reason: CheatReason.REPLAYED_ENTRY }]],
            [BlockChainName.CHAT, 'hash', [{ reporter: 'carol', reason: CheatReason.FORGED_AUTHOR }]],
        ]);
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
