import { Participant } from './participant';
import { LocalPlayer } from '@app/services/room-manager/classes/player/local-player';
import { Player } from '@app/services/room-manager/classes/player/player';
import { BlockChainMessage, BlockChainMessageType } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { TestHelper } from '@testing/test.helper';
import { describe, test, expect, vi } from 'vitest';

const message: BlockChainMessage = {
    type: BlockChainMessageType.GET_LAST_BLOCK_REQUEST,
    payload: null,
    origin: MessageOriginType.BLOCK_ROOM_SERVICE,
};

describe('Participant', () => {
    test('publicKey should throw if not set', () => {
        // Given
        const participant: Participant = new Participant(new LocalPlayer('a'));

        // When
        const call = (): CryptoKey => participant.publicKey;

        // Then
        expect(call).toThrow('Public key not set');
    });

    test('should expose the player information', () => {
        // Given
        const publicKey = TestHelper.cast<CryptoKey>({});
        const local: Participant = new Participant(new LocalPlayer('a'));
        const remote: Participant = new Participant(TestHelper.cast<Player>({ name: 'b', isLocal: false }));
        const readyRemote: Participant = new Participant(TestHelper.cast<Player>({ name: 'c', isLocal: false }));
        readyRemote.publicKey = publicKey;

        // When / Then
        expect(local.name).toEqual('a');
        expect(local.isLocal).toEqual(true);
        expect(local.isReady()).toEqual(true);
        expect(remote.isLocal).toEqual(false);
        expect(remote.isReady()).toEqual(false);
        expect(readyRemote.isReady()).toEqual(true);
        expect(readyRemote.publicKey).toBe(publicKey);
    });

    test('sendMessage should only send to remote players', () => {
        // Given
        const localPlayer: LocalPlayer = new LocalPlayer('a');
        const sendDataSpy = vi.spyOn(localPlayer, 'sendData');
        const remotePlayer = TestHelper.cast<Player>({ name: 'b', isLocal: false, sendData: vi.fn() });

        // When
        new Participant(localPlayer).sendMessage(message);
        new Participant(remotePlayer).sendMessage(message);

        // Then
        expect(sendDataSpy).not.toHaveBeenCalled();
        expect(remotePlayer.sendData).toHaveBeenCalledWith(message);
    });
});
