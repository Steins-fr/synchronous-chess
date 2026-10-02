import { ParticipantKeys, ParticipantReady, ParticipantRegistry } from './participant-registry';
import { BlockChainName } from '../block-chain-name.enum';
import { BlockChainMessage, BlockChainMessageType } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { LocalPlayer } from '@app/services/room-manager/classes/player/local-player';
import { Player } from '@app/services/room-manager/classes/player/player';
import {
    BlockRoomParticipantMessageType,
    NegotiationPayload,
    ReceivedBlockRoomParticipantMessage
} from '@app/services/room-manager/classes/webrtc/messages/block-room-participant-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

function receivedMessage(type: BlockRoomParticipantMessageType, payload: NegotiationPayload, from: string = 'b'): ReceivedBlockRoomParticipantMessage {
    return TestHelper.cast<ReceivedBlockRoomParticipantMessage>({ type, payload, origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT, from });
}

function createPlayer(name: string): Player {
    return TestHelper.cast<Player>({ name, isLocal: false, sendData: vi.fn() });
}

describe('ParticipantRegistry', () => {
    let keys: ParticipantKeys;
    let remoteKeys: ParticipantKeys;
    let registry: ParticipantRegistry;
    let remote: Player;
    let ready: ParticipantReady[];

    beforeAll(async () => {
        keys = await ParticipantRegistry.createKeys();
        remoteKeys = await ParticipantRegistry.createKeys();
    });

    beforeEach(() => {
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
        registry = new ParticipantRegistry(new LocalPlayer('a'), keys);
        remote = createPlayer('b');
        ready = [];
        registry.ready$.subscribe((participantReady: ParticipantReady) => ready.push(participantReady));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function remoteKey(nbParticipants: number = 2): NegotiationPayload {
        return { publicKey: remoteKeys.publicJwk, nbParticipants };
    }

    async function negotiate(player: Player = remote): Promise<void> {
        registry.handle(receivedMessage(BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE, remoteKey(), player.name));
        await vi.waitFor(() => expect(registry.get(player.name)?.isReady()).toEqual(true));
    }

    test('createKeys should create an ECDSA key pair with its exported public key', async () => {
        expect(keys.keyPair.privateKey.algorithm.name).toEqual('ECDSA');
        expect(keys.keyPair.publicKey.usages).toEqual(['verify']);
        expect(keys.publicJwk).toEqual(await crypto.subtle.exportKey('jwk', keys.keyPair.publicKey));
    });

    test('should start with the ready local participant', () => {
        expect(registry.local.name).toEqual('a');
        expect(registry.local.knownKeys).toEqual([keys.keyPair.publicKey]);
        expect(registry.get('a')).toBe(registry.local);
        expect([...registry.values()]).toEqual([registry.local]);
        expect(registry.size).toEqual(1);
        expect(registry.readyCount).toEqual(1);
    });

    test('should send its public key to a new player', () => {
        // When
        registry.onNewPlayer(remote);

        // Then
        expect(remote.sendData).toHaveBeenCalledExactlyOnceWith({
            type: BlockRoomParticipantMessageType.NEGOTIATION_REQUEST,
            payload: { nbParticipants: 2, publicKey: keys.publicJwk },
            origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT,
        });
        expect(registry.size).toEqual(2);
        expect(registry.readyCount).toEqual(1);
    });

    test('should answer a negotiation request and register the key it carries', async () => {
        // Given
        registry.onNewPlayer(remote);

        // When
        registry.handle(receivedMessage(BlockRoomParticipantMessageType.NEGOTIATION_REQUEST, remoteKey(3)));
        registry.handle(receivedMessage(BlockRoomParticipantMessageType.NEGOTIATION_REQUEST, remoteKey(), 'unknown'));

        // Then
        expect(remote.sendData).toHaveBeenLastCalledWith({
            type: BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE,
            payload: { nbParticipants: 2, publicKey: keys.publicJwk },
            origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT,
        });
        await vi.waitFor(() => expect(ready).toEqual([{ name: 'b', nbParticipants: 3 }]));
        expect(registry.readyCount).toEqual(2);
    });

    test('should register the key of a connection once, from its request or its response', async () => {
        // Given
        const importKeySpy = vi.spyOn(crypto.subtle, 'importKey');
        registry.onNewPlayer(remote);

        // When
        registry.handle(receivedMessage(BlockRoomParticipantMessageType.NEGOTIATION_REQUEST, remoteKey()));
        registry.handle(receivedMessage(BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE, remoteKey()));
        await vi.waitFor(() => expect(ready).toHaveLength(1));
        registry.handle(receivedMessage(BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE, remoteKey()));
        registry.handle(receivedMessage(BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE, remoteKey(), 'unknown'));

        // Then
        expect(importKeySpy).toHaveBeenCalledOnce();
        expect(ready).toEqual([{ name: 'b', nbParticipants: 2 }]);
        expect(registry.get('b')?.knownKeys).toHaveLength(1);
    });

    test('should log the messages which can not be handled', async () => {
        // Given
        registry.onNewPlayer(remote);

        // When
        registry.handle(receivedMessage(BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE, TestHelper.cast<NegotiationPayload>({ publicKey: {} })));
        registry.handle(TestHelper.cast<ReceivedBlockRoomParticipantMessage>({ type: 'unknown', payload: null, origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT, from: 'b' }));

        // Then
        await vi.waitFor(() => expect(TimedLogger.error).toHaveBeenCalledTimes(2));
        expect(TimedLogger.error).toHaveBeenCalledWith(`Failed to handle ${ BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE } from b`, expect.anything());
        expect(TimedLogger.error).toHaveBeenCalledWith('Failed to handle unknown from b', expect.any(Error));
        expect(ready).toEqual([]);
    });

    test('clear should only keep the local participant and complete the events', () => {
        // Given
        const completed: string[] = [];
        registry.ready$.subscribe({ complete: () => completed.push('ready') });
        registry.left$.subscribe({ complete: () => completed.push('left') });
        registry.onNewPlayer(remote);
        registry.onPlayerLeft(remote);

        // When
        registry.clear();

        // Then
        expect([...registry.values()]).toEqual([registry.local]);
        expect(registry.author('b')).toBeUndefined();
        expect(registry.readyCount).toEqual(1);
        expect(completed).toEqual(['ready', 'left']);
    });

    test('should keep the vote and the previous keys of a reconnecting player, and wait for its current key', async () => {
        // Given
        const reconnected: Player = createPlayer('b');
        registry.onNewPlayer(remote);
        await negotiate();
        const previousKeys: ReadonlyArray<CryptoKey> = registry.get('b')?.knownKeys ?? [];

        // When
        registry.onNewPlayer(reconnected);

        // Then
        expect(registry.readyCount).toEqual(2);
        expect(registry.get('b')?.isReady()).toEqual(false);
        expect(registry.get('b')?.knownKeys).toEqual(previousKeys);
        expect(reconnected.sendData).toHaveBeenCalledOnce();
    });

    test('should drop the key of a connection replaced during its import', async () => {
        // Given
        const importKeySpy = vi.spyOn(crypto.subtle, 'importKey');
        registry.onNewPlayer(remote);

        // When
        registry.handle(receivedMessage(BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE, remoteKey()));
        registry.onNewPlayer(createPlayer('b'));
        await importKeySpy.mock.results[0].value;
        await Promise.resolve();

        // Then
        expect(ready).toEqual([]);
        expect(registry.get('b')?.isReady()).toEqual(false);

        // When the new connection sends its key
        await negotiate();

        // Then
        expect(ready).toEqual([{ name: 'b', nbParticipants: 2 }]);
    });

    test('should stop counting the votes of the players who left, but keep them as authors', async () => {
        // Given
        const left: string[] = [];
        registry.left$.subscribe((name: string) => left.push(name));
        registry.onNewPlayer(remote);
        await negotiate();
        const participant = registry.get('b');

        // When
        registry.onPlayerLeft(remote);
        registry.onPlayerLeft(remote);
        registry.onPlayerLeft(new LocalPlayer('a'));

        // Then
        expect([...registry.values()]).toEqual([registry.local]);
        expect(registry.get('b')).toBeUndefined();
        expect(registry.author('b')).toBe(participant);
        expect(registry.author('a')).toBe(registry.local);
        expect(registry.readyCount).toEqual(1);
        expect(left).toEqual(['b']);
    });

    test('should forget a departed author once its blocks are approved', async () => {
        // Given
        registry.onNewPlayer(remote);
        await negotiate();
        vi.useFakeTimers();

        // When
        registry.onPlayerLeft(remote);
        vi.advanceTimersByTime(59_999);
        const authorBeforeDelay = registry.author('b');
        vi.advanceTimersByTime(1);

        // Then
        expect(authorBeforeDelay).toBeDefined();
        expect(registry.author('b')).toBeUndefined();
        vi.useRealTimers();
    });

    test('should not forget a departed author who came back, nor after clear', async () => {
        // Given
        const other: Player = createPlayer('c');
        registry.onNewPlayer(remote);
        registry.onNewPlayer(other);
        await negotiate();
        await negotiate(other);
        vi.useFakeTimers();
        registry.onPlayerLeft(remote);
        registry.onPlayerLeft(other);

        // When
        registry.onNewPlayer(remote);
        registry.clear();
        vi.advanceTimersByTime(60_000);

        // Then
        expect(vi.getTimerCount()).toEqual(0);
        vi.useRealTimers();
    });

    test('should forget a player who left before its key was received', () => {
        // Given
        registry.onNewPlayer(remote);

        // When
        registry.onPlayerLeft(remote);

        // Then
        expect(registry.author('b')).toBeUndefined();
    });

    test('should negotiate again a player who comes back, with its previous keys', async () => {
        // Given
        registry.onNewPlayer(remote);
        await negotiate();
        const previousKeys: ReadonlyArray<CryptoKey> = registry.get('b')?.knownKeys ?? [];
        registry.onPlayerLeft(remote);

        // When
        registry.onNewPlayer(remote);

        // Then
        expect(registry.author('b')).toBe(registry.get('b'));
        expect(registry.get('b')?.isReady()).toEqual(false);
        expect(registry.get('b')?.knownKeys).toEqual(previousKeys);
        expect(remote.sendData).toHaveBeenCalledTimes(2);
    });

    test('should send the messages to a participant or to all the remote ones', () => {
        // Given
        const other: Player = createPlayer('c');
        registry.onNewPlayer(remote);
        registry.onNewPlayer(other);
        const message: BlockChainMessage = { type: BlockChainMessageType.GET_LAST_BLOCK_REQUEST, payload: null, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: BlockChainName.CHESS };

        // When
        registry.send('b', message);
        registry.send('unknown', message);
        registry.broadcast(message);

        // Then
        expect(vi.mocked(remote.sendData).mock.calls.slice(1)).toEqual([[message], [message]]);
        expect(vi.mocked(other.sendData).mock.calls.slice(1)).toEqual([[message]]);
    });
});
