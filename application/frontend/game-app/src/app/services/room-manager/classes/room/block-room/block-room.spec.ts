import { BlockChainRouting, BlockRoom, mergeBlockChainRoutings } from './block-room';
import { AntiCheat } from './anti-cheat/anti-cheat';
import { CheatReason, CheatReport } from './anti-cheat/cheat-report';
import { SequencedBlockChain } from './block-chain/sequenced-block-chain';
import { Block } from './block-chain/block';
import { ParticipantKeys, ParticipantRegistry } from './block-chain/participant-registry';
import { ParticipantKeyStore } from './block-chain/participant-key-store';
import { BlockChainName } from './block-chain-name.enum';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Player } from '@app/services/room-manager/classes/player/player';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { AntiCheatMessageType } from '@app/services/room-manager/classes/webrtc/messages/anti-cheat-message';
import { BlockChainMessage, BlockChainMessageType } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import { BlockRoomParticipantMessageType } from '@app/services/room-manager/classes/webrtc/messages/block-room-participant-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NetworkMessage, ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { IDBFactory } from 'fake-indexeddb';
import { NEVER, Observable, Subject } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

interface TestPayloads {
    move: string;
    promotion: string;
    chat: string;
}

const routing: BlockChainRouting<TestPayloads> = { move: BlockChainName.CHESS, promotion: BlockChainName.CHESS, chat: BlockChainName.CHAT };

function chainName(context: unknown): string {
    return TestHelper.cast<SequencedBlockChain>(context).name;
}

describe('BlockRoom', () => {
    let keys: ParticipantKeys;
    let network: RoomNetworkMock;
    let roomApi: RoomSocketApi;
    const players: WebRtcPlayer[] = [];
    // Cleared after each test, like the page clears its room
    const rooms: Array<{ clear(): void }> = [];

    beforeAll(async () => {
        keys = await BlockRoom.createKeys('local', new ParticipantKeyStore(new IDBFactory()));
    });

    beforeEach(() => {
        vi.spyOn(TimedLogger, 'log').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
        // The local participant hosts the room, so it orders the blocks
        network = new RoomNetworkMock('local', true, 'local');
        roomApi = TestHelper.cast<RoomSocketApi>({ close: vi.fn() });
    });

    afterEach(() => {
        rooms.splice(0).forEach((room: { clear(): void }) => room.clear());
        players.splice(0).forEach((player: WebRtcPlayer) => player.clear());
        vi.restoreAllMocks();
    });

    function track<R extends { clear(): void }>(room: R): R {
        rooms.push(room);
        return room;
    }

    /** @param ticks$ none by default: the specs tick the room themselves, without timer */
    function createRoom(ticks$: Observable<number> = NEVER): BlockRoom<TestPayloads> {
        return track(new BlockRoom<TestPayloads>(roomApi, network.roomNetwork, keys, routing, ticks$));
    }

    function createRemote(name: string): Player {
        return TestHelper.cast<Player>({ name, isLocal: false, sendData: vi.fn() });
    }

    /** A remote participant tells the participants it is connected to */
    function connectedParticipants(from: string, participants: string[]): void {
        network.onMessage$.next({ type: AntiCheatMessageType.CONNECTED_PARTICIPANTS, payload: { participants }, origin: MessageOriginType.ANTI_CHEAT, from });
    }

    test('createKeys should create a signing key pair', () => {
        expect(keys.keyPair.privateKey.usages).toEqual(['sign']);
    });

    test('createKeys should keep the identity of a player when it comes back', async () => {
        // Given
        const keyStore: ParticipantKeyStore = new ParticipantKeyStore(new IDBFactory());
        const first: ParticipantKeys = await BlockRoom.createKeys('local', keyStore);

        // When
        const again: ParticipantKeys = await BlockRoom.createKeys('local', keyStore);

        // Then
        expect(again.publicJwk).toEqual(first.publicJwk);
    });

    test('should reject an empty routing at compile time', () => {
        // @ts-expect-error a routing without message type could not carry any message
        const build = (): BlockRoom<object> => new BlockRoom<object>(roomApi, network.roomNetwork, keys, {});

        expect(build).toBeTypeOf('function');
    });

    test('mergeBlockChainRoutings should merge the routings of several features', () => {
        expect(mergeBlockChainRoutings<{ move: string }, { chat: string }>({ move: BlockChainName.CHESS }, { chat: BlockChainName.CHAT }))
            .toEqual({ move: BlockChainName.CHESS, chat: BlockChainName.CHAT });
    });

    test('mergeBlockChainRoutings should refuse a message type routed twice', () => {
        expect(() => mergeBlockChainRoutings<{ move: string; chat: string }, { chat: string }>({ move: BlockChainName.CHESS, chat: BlockChainName.CHAT }, { chat: BlockChainName.CHESS }))
            .toThrow('Message types routed twice: chat');
    });

    test('should deliver the messages once ordered', async () => {
        // Given
        const room: BlockRoom<TestPayloads> = createRoom();
        const moves: AppMessage[] = [];
        room.messenger('move').subscribe((message: AppMessage) => moves.push(message));

        // When
        room.transmitMessage('move', 'e4');

        // Then
        await vi.waitFor(() => expect(moves).toEqual([{ from: 'local', type: 'move', payload: 'e4' }]));
    });

    test('should order the messages of each chain independently', async () => {
        // Given
        const room: BlockRoom<TestPayloads> = createRoom();
        const remote: Player = createRemote('remote');
        network.playerAdded$.next(remote);

        // When
        room.transmitMessage('chat', 'hello');
        room.transmitMessage('move', 'e4');

        // Then a chat block does not take the place of a game block: both are the first block of their chain
        await vi.waitFor(() => expect(vi.mocked(remote.sendData).mock.calls
            .map(([message]) => message as NetworkMessage)
            .filter((message: NetworkMessage): message is BlockChainMessage<BlockChainMessageType.NEW_BLOCK> => message.type === BlockChainMessageType.NEW_BLOCK)
            .map((message: BlockChainMessage<BlockChainMessageType.NEW_BLOCK>) => [message.chain, message.payload.index]))
            .toEqual(expect.arrayContaining([[BlockChainName.CHAT, 1], [BlockChainName.CHESS, 1]])));
    });

    test('should transmit each message type through its own chain', () => {
        // Given
        const transmitMessageSpy = vi.spyOn(SequencedBlockChain.prototype, 'transmitMessage').mockResolvedValue();
        const room: BlockRoom<TestPayloads> = createRoom();

        // When
        room.transmitMessage('move', 'e4');
        room.transmitMessage('promotion', 'queen');
        room.transmitMessage('chat', 'hello');

        // Then
        expect(transmitMessageSpy.mock.contexts.map(chainName)).toEqual([BlockChainName.CHESS, BlockChainName.CHESS, BlockChainName.CHAT]);
        expect(transmitMessageSpy.mock.contexts[0]).toBe(transmitMessageSpy.mock.contexts[1]);
    });

    test('should refuse to transmit a message type without block chain', () => {
        // Given
        const room: BlockRoom<TestPayloads> = createRoom();

        // When / Then
        expect(() => room.transmitMessage(TestHelper.cast<'move'>('unknown'), 'e4')).toThrow('No block chain routes the unknown messages');
    });

    test('notifyMessage should publish the message of the block', () => {
        // Given
        const room: BlockRoom<TestPayloads> = createRoom();
        const data: AppMessage = { from: 'remote', type: 'move', payload: 'd5' };
        const moves: AppMessage[] = [];
        room.messenger('move').subscribe((message: AppMessage) => moves.push(message));

        // When
        room.notifyMessage(BlockChainName.CHESS, new Block(1, 'previous', { id: 'id', data, signature: 'signature' }, 'local', 'hash', 'signature'));

        // Then
        expect(moves).toEqual([data]);
    });

    test('should dispatch the network messages to the participants, the anti-cheat or their block chain', () => {
        // Given
        const participantHandleSpy = vi.spyOn(ParticipantRegistry.prototype, 'handle').mockImplementation(() => undefined);
        const antiCheatHandleSpy = vi.spyOn(AntiCheat.prototype, 'handle').mockImplementation(() => undefined);
        const chainHandleSpy = vi.spyOn(SequencedBlockChain.prototype, 'handle').mockImplementation(() => undefined);
        createRoom();
        const participantMessage: ReceivedMessage = { type: BlockRoomParticipantMessageType.NEGOTIATION_REQUEST, payload: { publicKey: {} }, origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT, from: 'remote' };
        const antiCheatMessage: ReceivedMessage = { type: AntiCheatMessageType.CHEAT_REPORT, payload: TestHelper.cast<CheatReport>({}), origin: MessageOriginType.ANTI_CHEAT, from: 'remote' };
        const chatMessage: ReceivedMessage = { type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: { from: 1 }, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: BlockChainName.CHAT, from: 'remote' };

        // When
        network.onMessage$.next(participantMessage);
        network.onMessage$.next(antiCheatMessage);
        network.onMessage$.next(chatMessage);
        network.onMessage$.next({ type: 'move', payload: 'e4', origin: MessageOriginType.ROOM_SERVICE, from: 'remote' });

        // Then
        expect(participantHandleSpy.mock.calls).toEqual([[participantMessage]]);
        expect(antiCheatHandleSpy.mock.calls).toEqual([[antiCheatMessage]]);
        expect(chainHandleSpy.mock.calls).toEqual([[chatMessage]]);
        expect(chainHandleSpy.mock.contexts.map(chainName)).toEqual([BlockChainName.CHAT]);
    });

    test('should log the messages of a block chain missing from the room', () => {
        // Given
        const chainHandleSpy = vi.spyOn(SequencedBlockChain.prototype, 'handle');
        track(new BlockRoom<{ move: string }>(roomApi, network.roomNetwork, keys, { move: BlockChainName.CHESS }, NEVER));

        // When
        network.onMessage$.next({ type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: { from: 1 }, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: BlockChainName.CHAT, from: 'remote' });

        // Then
        expect(chainHandleSpy).not.toHaveBeenCalled();
        expect(TimedLogger.error).toHaveBeenCalledWith('No chat block chain in this room, message from remote');
    });

    test('should negotiate the new players once for all the block chains', async () => {
        // Given
        const onParticipantReadySpy = vi.spyOn(SequencedBlockChain.prototype, 'onParticipantReady').mockImplementation(() => undefined);
        const room: BlockRoom<TestPayloads> = createRoom();
        const remote: Player = createRemote('remote');

        // When
        network.playerAdded$.next(remote);
        network.onMessage$.next({
            type: BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE,
            payload: { publicKey: keys.publicJwk },
            origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT,
            from: 'remote',
        });

        // Then
        expect(room.players()).toEqual([network.localPlayer, remote]);
        await vi.waitFor(() => expect(onParticipantReadySpy.mock.contexts.map(chainName)).toEqual([BlockChainName.CHESS, BlockChainName.CHAT]));
        expect(onParticipantReadySpy).toHaveBeenCalledWith('remote');
        // Then tells it the sequencer it follows
        expect(vi.mocked(remote.sendData).mock.calls).toEqual([
            [{ type: BlockRoomParticipantMessageType.NEGOTIATION_REQUEST, payload: { publicKey: keys.publicJwk }, origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT }],
            [{ type: AntiCheatMessageType.SEQUENCER_STATE, payload: { sequencer: 'local', handovers: 0, distrusted: [] }, origin: MessageOriginType.ANTI_CHEAT }],
            [{ type: AntiCheatMessageType.CONNECTED_PARTICIPANTS, payload: { participants: ['remote'] }, origin: MessageOriginType.ANTI_CHEAT }],
        ]);
    });

    test('should follow the sequencer most of the other participants follow, after more handovers than it made', () => {
        // Given a player joining a room whose host was distrusted
        network = new RoomNetworkMock('local', false, 'host');
        const changeSequencerSpy = vi.spyOn(SequencedBlockChain.prototype, 'changeSequencer').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        createRoom();
        const b: Player = createRemote('b');
        ['host', 'c'].forEach((name: string) => network.playerAdded$.next(createRemote(name)));
        network.playerAdded$.next(b);
        const state = (from: string, sequencer: string, handovers: number, distrusted: string[]): void => network.onMessage$.next({
            type: AntiCheatMessageType.SEQUENCER_STATE,
            payload: { sequencer, handovers, distrusted },
            origin: MessageOriginType.ANTI_CHEAT,
            from,
        });

        // When b tells it then leaves, c tells it, and the host claims it still orders
        state('b', 'b', 1, ['host']);
        network.playerRemoved$.next(b);
        state('c', 'b', 1, ['host']);
        state('host', 'host', 0, []);

        // Then the state of a participant who left does not count
        expect(changeSequencerSpy).not.toHaveBeenCalled();

        // When b comes back and tells it again
        network.playerAdded$.next(b);
        state('b', 'b', 1, ['host']);
        state('host', 'c', 1, []);

        // Then
        expect(changeSequencerSpy.mock.calls).toEqual([['b'], ['b']]);
        expect(TimedLogger.warn).toHaveBeenCalledWith('Most of the participants follow b, after 1 handovers');
    });

    test('should hand the ordering over to the first participant by name once every participant lost the sequencer', () => {
        // Given
        network = new RoomNetworkMock('local', false, 'host');
        const onParticipantLeftSpy = vi.spyOn(SequencedBlockChain.prototype, 'onParticipantLeft').mockImplementation(() => undefined);
        const changeSequencerSpy = vi.spyOn(SequencedBlockChain.prototype, 'changeSequencer').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        const room: BlockRoom<TestPayloads> = createRoom();
        const host: Player = createRemote('host');
        const other: Player = createRemote('b');
        network.playerAdded$.next(host);
        network.playerAdded$.next(other);

        // When this participant loses the sequencer, b still connected to it
        network.playerRemoved$.next(host);
        connectedParticipants('b', ['host', 'local']);
        const whileConnected: number = changeSequencerSpy.mock.calls.length;
        // Then b loses it too
        connectedParticipants('b', ['local']);

        // Then
        expect(whileConnected).toEqual(0);
        expect(room.players()).toEqual([network.localPlayer, other]);
        expect(onParticipantLeftSpy.mock.calls).toEqual([['host'], ['host']]);
        expect(changeSequencerSpy.mock.calls).toEqual([['b'], ['b']]);
        expect(changeSequencerSpy.mock.contexts.map(chainName)).toEqual([BlockChainName.CHESS, BlockChainName.CHAT]);
        expect(TimedLogger.warn).toHaveBeenCalledWith('host has left the room');
    });

    test('should keep the sequencer when another participant leaves the room', () => {
        // Given
        network = new RoomNetworkMock('local', false, 'host');
        vi.spyOn(SequencedBlockChain.prototype, 'onParticipantLeft').mockImplementation(() => undefined);
        const changeSequencerSpy = vi.spyOn(SequencedBlockChain.prototype, 'changeSequencer').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        createRoom();
        const b: Player = createRemote('b');
        [createRemote('host'), b].forEach((player: Player) => network.playerAdded$.next(player));

        // When
        network.playerRemoved$.next(b);
        connectedParticipants('host', ['local']);

        // Then
        expect(TimedLogger.warn).toHaveBeenCalledWith('b has left the room');
        expect(changeSequencerSpy).not.toHaveBeenCalled();
    });

    test('should keep the sequencer a participant comes back to before the others lost it', () => {
        // Given
        network = new RoomNetworkMock('local', false, 'host');
        vi.spyOn(SequencedBlockChain.prototype, 'onParticipantLeft').mockImplementation(() => undefined);
        const changeSequencerSpy = vi.spyOn(SequencedBlockChain.prototype, 'changeSequencer').mockImplementation(() => undefined);
        createRoom();
        const host: Player = createRemote('host');
        network.playerAdded$.next(host);
        network.playerAdded$.next(createRemote('b'));

        // When this participant loses then gets back the sequencer, before b loses it later
        network.playerRemoved$.next(host);
        network.playerAdded$.next(host);
        connectedParticipants('b', ['local']);

        // Then
        expect(changeSequencerSpy).not.toHaveBeenCalled();
    });

    test('should wait for the participants which did not tell whom they are connected to', () => {
        // Given
        network = new RoomNetworkMock('local', false, 'host');
        vi.spyOn(SequencedBlockChain.prototype, 'onParticipantLeft').mockImplementation(() => undefined);
        const changeSequencerSpy = vi.spyOn(SequencedBlockChain.prototype, 'changeSequencer').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        createRoom();
        const host: Player = createRemote('host');
        const b: Player = createRemote('b');
        [host, b, createRemote('c')].forEach((player: Player) => network.playerAdded$.next(player));

        // When b lost the host, c told nothing, then c leaves
        network.playerRemoved$.next(host);
        connectedParticipants('b', ['c', 'local']);
        const whileWaiting: number = changeSequencerSpy.mock.calls.length;
        network.playerRemoved$.next(TestHelper.cast<Player>({ name: 'c' }));

        // Then
        expect(whileWaiting).toEqual(0);
        expect(changeSequencerSpy.mock.calls).toEqual([['b'], ['b']]);
    });

    test('should ignore invalid connected participants', () => {
        // Given
        network = new RoomNetworkMock('local', false, 'host');
        vi.spyOn(SequencedBlockChain.prototype, 'onParticipantLeft').mockImplementation(() => undefined);
        const changeSequencerSpy = vi.spyOn(SequencedBlockChain.prototype, 'changeSequencer').mockImplementation(() => undefined);
        createRoom();
        const host: Player = createRemote('host');
        [host, createRemote('b')].forEach((player: Player) => network.playerAdded$.next(player));
        network.playerRemoved$.next(host);

        // When
        network.onMessage$.next({ type: AntiCheatMessageType.CONNECTED_PARTICIPANTS, payload: { participants: 'local' as unknown as string[] }, origin: MessageOriginType.ANTI_CHEAT, from: 'b' });

        // Then
        expect(changeSequencerSpy).not.toHaveBeenCalled();
        expect(TimedLogger.error).toHaveBeenCalledWith('Invalid connected participants from b', { participants: 'local' });
    });

    test('should order the names by their code units, the same in every browser whatever its locale', () => {
        // Given participants a locale would order a, B
        network = new RoomNetworkMock('local', false, 'host');
        vi.spyOn(SequencedBlockChain.prototype, 'onParticipantLeft').mockImplementation(() => undefined);
        const changeSequencerSpy = vi.spyOn(SequencedBlockChain.prototype, 'changeSequencer').mockImplementation(() => undefined);
        createRoom();
        const host: Player = createRemote('host');
        [host, createRemote('a'), createRemote('B')].forEach((player: Player) => network.playerAdded$.next(player));
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);

        // When
        network.playerRemoved$.next(host);
        connectedParticipants('a', ['B', 'local']);
        connectedParticipants('B', ['a', 'local']);

        // Then B (66) comes before a (97) and before local (108)
        expect(changeSequencerSpy.mock.calls).toEqual([['B'], ['B']]);
    });

    test('should expose the cheats reported to the room', () => {
        // Given
        const room: BlockRoom<TestPayloads> = createRoom();
        const report: CheatReport = { chain: BlockChainName.CHESS, subject: 'hash', index: 1, author: 'b', sequencer: 'local', reason: CheatReason.FORGED_AUTHOR };

        // When
        network.onMessage$.next({ type: AntiCheatMessageType.CHEAT_REPORT, payload: report, origin: MessageOriginType.ANTI_CHEAT, from: 'remote' });

        // Then
        expect(room.cheatFlags()).toEqual([{
            chain: BlockChainName.CHESS,
            subject: 'hash',
            index: 1,
            author: 'b',
            sequencer: 'local',
            reports: [{ reporter: 'remote', reason: CheatReason.FORGED_AUTHOR }],
        }]);
    });

    test('should tick the block chains at the given times, until cleared', () => {
        // Given
        const tickSpy = vi.spyOn(SequencedBlockChain.prototype, 'tick').mockImplementation(() => undefined);
        const ticks: Subject<number> = new Subject<number>();
        const room: BlockRoom<TestPayloads> = createRoom(ticks);

        // When
        ticks.next(1000);
        room.clear();
        ticks.next(2000);

        // Then: one tick for each of the two chains
        expect(tickSpy.mock.calls).toEqual([[1000], [1000]]);
    });

    test('should tick the block chains every 2 seconds by default, until cleared', () => {
        // Given
        vi.useFakeTimers({ now: 1000 });
        const tickSpy = vi.spyOn(SequencedBlockChain.prototype, 'tick').mockImplementation(() => undefined);
        const room: BlockRoom<TestPayloads> = track(new BlockRoom<TestPayloads>(roomApi, network.roomNetwork, keys, routing));

        // When
        vi.advanceTimersByTime(2000);
        room.clear();
        vi.advanceTimersByTime(2000);
        vi.useRealTimers();

        // Then
        expect(tickSpy.mock.calls).toEqual([[3000], [3000]]);
        expect(tickSpy.mock.contexts.map(chainName)).toEqual([BlockChainName.CHESS, BlockChainName.CHAT]);
    });

    test('should hand the ordering over when most of the other participants report the sequencer', () => {
        // Given
        network = new RoomNetworkMock('local', false, 'host');
        const changeSequencerSpy = vi.spyOn(SequencedBlockChain.prototype, 'changeSequencer').mockImplementation(() => undefined);
        createRoom();
        ['host', 'b', 'c'].forEach((name: string) => network.playerAdded$.next(createRemote(name)));
        const report = (from: string, sequencer: string = 'host'): void => network.onMessage$.next({
            type: AntiCheatMessageType.CHEAT_REPORT,
            payload: { chain: BlockChainName.CHESS, subject: `${ from } ${ sequencer }`, author: 'local', sequencer, reason: CheatReason.CENSORED_ENTRY },
            origin: MessageOriginType.ANTI_CHEAT,
            from,
        });

        // When half of the other participants report it
        report('b');
        report('c', 'b');

        // Then
        expect(changeSequencerSpy).not.toHaveBeenCalled();

        // When most of them report it
        report('c');

        // Then the first participant by name takes over
        expect(changeSequencerSpy.mock.calls).toEqual([['b'], ['b']]);
    });

    test('should keep its sequencer when no participant can take over', () => {
        // Given
        const changeSequencerSpy = vi.spyOn(SequencedBlockChain.prototype, 'changeSequencer').mockImplementation(() => undefined);
        const warnSpy = vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        const room: BlockRoom<TestPayloads> = createRoom();
        network.playerAdded$.next(createRemote('b'));
        network.onMessage$.next({
            type: AntiCheatMessageType.CHEAT_REPORT,
            payload: { chain: BlockChainName.CHESS, subject: 'entry', author: 'b', sequencer: 'local', reason: CheatReason.CENSORED_ENTRY },
            origin: MessageOriginType.ANTI_CHEAT,
            from: 'b',
        });
        expect(changeSequencerSpy.mock.calls).toEqual([['b'], ['b']]);

        // When the new sequencer is reported too
        TestHelper.cast<{ antiCheat: AntiCheat }>(room).antiCheat.report({ chain: BlockChainName.CHESS, subject: 'block', index: 1, author: 'b', sequencer: 'b', reason: CheatReason.FORGED_SEQUENCING });

        // Then
        expect(changeSequencerSpy).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenCalledWith('No participant left to order the blocks');
    });

    test('should report the messages the application finds cheated', async () => {
        // Given
        const room: BlockRoom<TestPayloads> = createRoom();
        const moves: AppMessage[] = [];
        room.messenger('move').subscribe((message: AppMessage) => moves.push(message));
        room.transmitMessage('move', 'e9');
        await vi.waitFor(() => expect(moves).toHaveLength(1));

        // When
        room.reportCheat({ from: 'local', type: 'move', payload: 'e9' }, CheatReason.ILLEGAL_MOVE);
        room.reportCheat(moves[0], CheatReason.ILLEGAL_MOVE);

        // Then only a message delivered by the room is reported
        expect(room.cheatFlags()).toEqual([expect.objectContaining({
            chain: BlockChainName.CHESS,
            index: 1,
            author: 'local',
            sequencer: 'local',
            reports: [{ reporter: 'local', reason: CheatReason.ILLEGAL_MOVE }],
        })]);
    });

    test('clear should clear the room, the participants, the anti-cheat and the block chains', () => {
        // Given
        const chainClearSpy = vi.spyOn(SequencedBlockChain.prototype, 'clear');
        const participantsClearSpy = vi.spyOn(ParticipantRegistry.prototype, 'clear');
        const antiCheatClearSpy = vi.spyOn(AntiCheat.prototype, 'clear');
        const room: BlockRoom<TestPayloads> = createRoom();

        // When
        room.clear();

        // Then
        expect(network.clear).toHaveBeenCalledTimes(1);
        expect(roomApi.close).toHaveBeenCalledTimes(1);
        expect(participantsClearSpy).toHaveBeenCalledTimes(1);
        expect(antiCheatClearSpy).toHaveBeenCalledTimes(1);
        expect(chainClearSpy).toHaveBeenCalledTimes(2);
    });

    describe('between peers', () => {
        interface Peer {
            name: string;
            network: RoomNetworkMock;
            room: BlockRoom<TestPayloads>;
            ticks: Subject<number>;
            received: AppMessage[];
            links: Map<string, WebRtcPlayer>;
        }

        async function createPeer(name: string, hostName: string): Promise<Peer> {
            const peerNetwork: RoomNetworkMock = new RoomNetworkMock(name, name === hostName, hostName);
            const peerKeys: ParticipantKeys = await BlockRoom.createKeys(name, new ParticipantKeyStore(new IDBFactory()));
            const ticks: Subject<number> = new Subject<number>();
            const room: BlockRoom<TestPayloads> = track(new BlockRoom<TestPayloads>(roomApi, peerNetwork.roomNetwork, peerKeys, routing, ticks));
            const received: AppMessage[] = [];
            room.messenger('chat').subscribe((message: AppMessage) => received.push(message));
            room.messenger('move').subscribe((message: AppMessage) => received.push(message));
            return { name, network: peerNetwork, room, ticks, received, links: new Map() };
        }

        /** @param drops the messages the receiver ignores */
        function link(from: Peer, to: Peer, drops: (message: NetworkMessage) => boolean = () => false): void {
            const webrtcMock: WebrtcMock = new WebrtcMock();
            webrtcMock.sendMessage.mockImplementation((message: NetworkMessage) => {
                const delivered: ReceivedMessage = { ...JSON.parse(JSON.stringify(message)), from: from.name };
                if (!drops(message)) {
                    setTimeout(() => to.network.onMessage$.next(delivered));
                }
                return 1;
            });
            const player: WebRtcPlayer = new WebRtcPlayer(to.name, webrtcMock.webrtc);
            players.push(player);
            from.links.set(to.name, player);
            from.network.playerAdded$.next(player);
        }

        function connect(...peers: Peer[]): void {
            for (const from of peers) {
                for (const to of peers) {
                    if (from !== to) {
                        link(from, to);
                    }
                }
            }
        }

        function tick(peer: Peer, now: number): void {
            peer.ticks.next(now);
        }

        function leave(peer: Peer, others: ReadonlyArray<Peer>): void {
            for (const other of others) {
                other.network.playerRemoved$.next(other.links.get(peer.name) as WebRtcPlayer);
            }
        }

        test('should share the messages of each chain, ordered by the host', async () => {
            // Given
            const host: Peer = await createPeer('host', 'host');
            const peer: Peer = await createPeer('peer', 'host');
            connect(host, peer);

            // When
            peer.room.transmitMessage('chat', 'hello');
            peer.room.transmitMessage('move', 'e4');
            host.room.transmitMessage('move', 'e5');

            // Then
            const expected: AppMessage[] = [
                { from: 'peer', type: 'chat', payload: 'hello' },
                { from: 'peer', type: 'move', payload: 'e4' },
                { from: 'host', type: 'move', payload: 'e5' },
            ];
            await vi.waitFor(() => {
                expect(host.received).toEqual(expect.arrayContaining(expected));
                expect(peer.received).toEqual(expect.arrayContaining(expected));
            });
            expect(host.received).toHaveLength(3);
            expect(peer.received).toHaveLength(3);
            expect(host.room.cheatFlags()).toEqual([]);
            expect(peer.room.cheatFlags()).toEqual([]);
        });

        test('should go on once the host left, ordered by the next participant', async () => {
            // Given
            const host: Peer = await createPeer('host', 'host');
            const alice: Peer = await createPeer('alice', 'host');
            const bob: Peer = await createPeer('bob', 'host');
            connect(host, alice, bob);
            bob.room.transmitMessage('move', 'e4');
            await vi.waitFor(() => expect(alice.received).toHaveLength(1));

            // When
            leave(host, [alice, bob]);
            bob.room.transmitMessage('chat', 'still there?');

            // Then
            await vi.waitFor(() => {
                expect(alice.received).toEqual([{ from: 'bob', type: 'move', payload: 'e4' }, { from: 'bob', type: 'chat', payload: 'still there?' }]);
                expect(bob.received).toEqual(alice.received);
            });
            expect(alice.room.cheatFlags()).toEqual([]);
        });

        test('should keep the host ordering when only the link between it and a participant broke', async () => {
            // Given
            const host: Peer = await createPeer('host', 'host');
            const alice: Peer = await createPeer('alice', 'host');
            const bob: Peer = await createPeer('bob', 'host');
            connect(host, alice, bob);
            const warn = vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
            const changeSequencerSpy = vi.spyOn(SequencedBlockChain.prototype, 'changeSequencer');
            await vi.waitFor(() => expect(host.room.players()).toHaveLength(3));

            // When the host and bob lose each other, alice still connected to both
            host.network.playerRemoved$.next(host.links.get('bob') as WebRtcPlayer);
            bob.network.playerRemoved$.next(bob.links.get('host') as WebRtcPlayer);
            alice.room.transmitMessage('chat', 'still ordered by the host');

            // Then
            await vi.waitFor(() => expect(alice.received).toEqual([{ from: 'alice', type: 'chat', payload: 'still ordered by the host' }]));
            expect(host.received).toEqual(alice.received);
            expect(warn).not.toHaveBeenCalledWith('host has left the room');
            // Not even bob, which can not reach the host
            expect(changeSequencerSpy).not.toHaveBeenCalled();
        });

        test('should hand the ordering over when the host ignores the entries of a participant', async () => {
            // Given a host ignoring the entries of bob
            const host: Peer = await createPeer('host', 'host');
            const alice: Peer = await createPeer('alice', 'host');
            const bob: Peer = await createPeer('bob', 'host');
            for (const [from, to] of [[host, alice], [host, bob], [alice, host], [alice, bob], [bob, alice]]) {
                link(from, to);
            }
            link(bob, host, (message: NetworkMessage) => message.type === BlockChainMessageType.SUBMIT_ENTRY);
            vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);

            // When bob plays, while the host goes on ordering the entries of the others
            bob.room.transmitMessage('move', 'e4');
            alice.room.transmitMessage('move', 'd5');
            await vi.waitFor(() => expect(bob.received).toEqual([{ from: 'alice', type: 'move', payload: 'd5' }]));
            [alice, bob].forEach((peer: Peer) => tick(peer, 0));
            [alice, bob].forEach((peer: Peer) => tick(peer, 10_000));

            // Then alice and bob report it, alice takes over and orders the move of bob
            await vi.waitFor(() => {
                expect(host.room.cheatFlags()).toEqual([expect.objectContaining({
                    author: 'bob',
                    sequencer: 'host',
                    reports: expect.arrayContaining([
                        { reporter: 'alice', reason: CheatReason.CENSORED_ENTRY },
                        { reporter: 'bob', reason: CheatReason.CENSORED_ENTRY },
                    ]),
                })]);
                expect(alice.received).toContainEqual({ from: 'bob', type: 'move', payload: 'e4' });
                expect(bob.received).toContainEqual({ from: 'bob', type: 'move', payload: 'e4' });
            });
        });
    });
});
