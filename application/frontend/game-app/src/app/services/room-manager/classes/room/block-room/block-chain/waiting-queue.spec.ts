import { WaitingQueue } from './waiting-queue';
import { Block } from './block';
import { Participant } from './participant';
import { LocalPlayer } from '@app/services/room-manager/classes/player/local-player';
import { Player } from '@app/services/room-manager/classes/player/player';
import { TestHelper } from '@testing/test.helper';
import { describe, test, expect, vi } from 'vitest';

function createBlock(index: number, hash: string): Block {
    return new Block(index, '', { from: 'a', type: 't', payload: null }, '', hash, '');
}

function createRemote(name: string): Participant {
    return new Participant(TestHelper.cast<Player>({ name, isLocal: false, sendData: vi.fn() }));
}

function createQueue(): { queue: WaitingQueue; local: Participant } {
    const queue: WaitingQueue = new WaitingQueue();
    const local: Participant = new Participant(new LocalPlayer('local'));
    queue.localParticipant = local;
    return { queue, local };
}

describe('WaitingQueue', () => {
    test('should create an instance', () => {
        expect(new WaitingQueue()).toBeTruthy();
    });

    test('localParticipant should throw if not set', () => {
        // Given
        const queue: WaitingQueue = new WaitingQueue();

        // When
        const call = (): Participant => queue.localParticipant;

        // Then
        expect(call).toThrow('Local participant not set');
    });

    test('approveBlock should register the approval once', () => {
        // Given
        const { queue, local } = createQueue();
        const block: Block = createBlock(1, 'b');

        // When
        const first: boolean = queue.approveBlock(block, local);
        const second: boolean = queue.approveBlock(block, local);

        // Then
        expect(first).toEqual(true);
        expect(second).toEqual(true);
        expect(queue.hasBlock(block)).toEqual(true);
        expect(queue.hasApprovedBlock(block, local)).toEqual(true);
        expect(queue.hasDeclinedBlock(block, local)).toEqual(false);
    });

    test('approveBlock should decline the new block if a concurrent block has a lower hash', () => {
        // Given
        const { queue, local } = createQueue();
        const lowBlock: Block = createBlock(1, 'a');
        const highBlock: Block = createBlock(1, 'b');
        queue.approveBlock(lowBlock, local);

        // When
        const result: boolean = queue.approveBlock(highBlock, local);

        // Then
        expect(result).toEqual(false);
        expect(queue.hasDeclinedBlock(highBlock, local)).toEqual(true);
        expect(queue.hasDeclinedBlock(lowBlock, local)).toEqual(false);
    });

    test('approveBlock should decline the concurrent block if it has a higher hash', () => {
        // Given
        const { queue, local } = createQueue();
        const lowBlock: Block = createBlock(1, 'a');
        const highBlock: Block = createBlock(1, 'b');
        queue.approveBlock(highBlock, local);

        // When
        const result: boolean = queue.approveBlock(lowBlock, local);
        queue.approveBlock(lowBlock, local);

        // Then
        expect(result).toEqual(true);
        expect(queue.hasDeclinedBlock(highBlock, local)).toEqual(true);
        expect(queue.hasApprovedBlock(lowBlock, local)).toEqual(true);
    });

    test('approveBlock should not approve twice a block already declined by the local participant', () => {
        // Given
        const { queue, local } = createQueue();
        const lowBlock: Block = createBlock(1, 'a');
        const highBlock: Block = createBlock(1, 'b');
        const remote: Participant = createRemote('remote');
        queue.approveBlock(lowBlock, local);
        queue.approveBlock(highBlock, remote);

        // When
        const result: boolean = queue.approveBlock(highBlock, local);

        // Then
        expect(result).toEqual(false);
        expect(queue.hasApprovedBlock(highBlock, remote)).toEqual(true);
        expect(queue.hasDeclinedBlock(highBlock, local)).toEqual(true);
    });

    test('declineBlock should register the decline once', () => {
        // Given
        const { queue } = createQueue();
        const remote: Participant = createRemote('remote');
        const block: Block = createBlock(1, 'b');
        queue.participantNumber = 2;

        // When
        queue.declineBlock(block, remote);
        queue.declineBlock(block, remote);

        // Then
        expect(queue.hasDeclinedBlock(block, remote)).toEqual(true);
        expect(queue.blockIsDeclined(block)).toEqual(false);
        queue.declineBlock(block, createRemote('other'));
        expect(queue.blockIsDeclined(block)).toEqual(true);
    });

    test('should return false for unknown blocks', () => {
        // Given
        const { queue, local } = createQueue();
        const block: Block = createBlock(1, 'unknown');

        // When / Then
        expect(queue.hasBlock(block)).toEqual(false);
        expect(queue.hasApprovedBlock(block, local)).toEqual(false);
        expect(queue.hasDeclinedBlock(block, local)).toEqual(false);
        expect(queue.blockIsDeclined(block)).toEqual(false);
        expect(queue.blockJustApproved(block)).toEqual(false);
        expect(queue.blockIsApproved(block)).toEqual(false);
    });

    test('blockJustApproved should approve a block only once', () => {
        // Given
        const { queue, local } = createQueue();
        const block: Block = createBlock(1, 'b');
        queue.participantNumber = 2;
        queue.approveBlock(block, local);

        // When
        const notEnough: boolean = queue.blockJustApproved(block);
        queue.approveBlock(block, createRemote('remote'));
        const approved: boolean = queue.blockJustApproved(block);
        const alreadyApproved: boolean = queue.blockJustApproved(block);

        // Then
        expect(notEnough).toEqual(false);
        expect(approved).toEqual(true);
        expect(alreadyApproved).toEqual(false);
        expect(queue.blockIsApproved(block)).toEqual(true);
    });

    test('blockJustApproved should not approve a declined block', () => {
        // Given
        const { queue, local } = createQueue();
        const block: Block = createBlock(1, 'b');
        queue.approveBlock(block, local);
        queue.declineBlock(block, createRemote('remote'));

        // When
        const result: boolean = queue.blockJustApproved(block);

        // Then
        expect(result).toEqual(false);
    });

    test('should clear blocks', () => {
        // Given
        const { queue, local } = createQueue();
        const oldBlock: Block = createBlock(1, 'old');
        const recentBlock: Block = createBlock(12, 'recent');
        const otherBlock: Block = createBlock(13, 'other');
        queue.approveBlock(oldBlock, local);
        queue.approveBlock(recentBlock, local);
        queue.approveBlock(otherBlock, local);

        // When
        queue.clearOldBlock(12);
        const oldCleared: boolean = !queue.hasBlock(oldBlock) && queue.hasBlock(recentBlock);
        queue.clearBlock(recentBlock);
        const recentCleared: boolean = !queue.hasBlock(recentBlock) && queue.hasBlock(otherBlock);
        queue.clear();

        // Then
        expect(oldCleared).toEqual(true);
        expect(recentCleared).toEqual(true);
        expect(queue.hasBlock(otherBlock)).toEqual(false);
    });
});
