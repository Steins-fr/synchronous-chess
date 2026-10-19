import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { NotificationService } from '@app/services/notification/notification.service';
import { CheatFlag, CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { TestHelper } from '@testing/test.helper';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { notifyCheatFlags } from './cheat-notifications';

const flags = signal<ReadonlyArray<Readonly<CheatFlag>> | undefined>(undefined);

@Component({ template: '' })
class HostComponent {
    public constructor() {
        notifyCheatFlags(() => flags());
    }
}

function flag(hash: string, reporters: ReadonlyArray<string>): CheatFlag {
    return {
        chain: BlockChainName.CHESS,
        subject: hash,
        index: 3,
        author: 'bob',
        sequencer: 'host',
        reports: reporters.map((reporter: string) => ({ reporter, reason: CheatReason.FORGED_AUTHOR })),
    };
}

describe('notifyCheatFlags', () => {
    let notificationService: NotificationService;

    beforeEach(() => {
        flags.set(undefined);
        notificationService = TestHelper.cast<NotificationService>({ error: vi.fn() });
        TestBed.configureTestingModule({ providers: [{ provide: NotificationService, useValue: notificationService }] });
    });

    test('should notify each new report of a cheated block', () => {
        // Given
        TestBed.createComponent(HostComponent);
        TestBed.tick();

        // When
        flags.set([flag('a', ['alice'])]);
        TestBed.tick();
        flags.set([flag('a', ['alice', 'carol']), flag('b', ['alice'])]);
        TestBed.tick();
        flags.set([flag('a', ['alice', 'carol']), flag('b', ['alice'])]);
        TestBed.tick();

        // Then
        const flagged = (reporters: string) => [{ key: 'cheat.flagged', params: { chain: BlockChainName.CHESS, author: 'bob', reporters, index: 3 } }];
        expect(vi.mocked(notificationService.error).mock.calls).toEqual([flagged('alice'), flagged('alice, carol'), flagged('alice')]);
    });

    test('should notify an entry the sequencer does not order', () => {
        // Given
        TestBed.createComponent(HostComponent);

        // When
        flags.set([{ ...flag('entry', ['alice']), index: undefined }]);
        TestBed.tick();

        // Then
        expect(notificationService.error).toHaveBeenCalledExactlyOnceWith({
            key: 'cheat.ignored',
            params: { chain: BlockChainName.CHESS, author: 'bob', reporters: 'alice', sequencer: 'host' },
        });
        const [[text]] = vi.mocked(notificationService.error).mock.calls;
        expect(TestBed.inject(TranslocoService).translate(text.key, text.params)).toEqual('A message (chess) from bob is ignored by host, reported by alice');
    });
});
