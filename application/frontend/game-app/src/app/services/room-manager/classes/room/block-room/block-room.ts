import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import {
    AntiCheatMessageType,
    ReceivedAntiCheatMessage,
    SequencerState
} from '@app/services/room-manager/classes/webrtc/messages/anti-cheat-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Room } from '@app/services/room-manager/classes/room/room';
import { interval, map, Observable, takeUntil } from 'rxjs';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Block } from './block-chain/block';
import { Signal } from '@angular/core';
import { AntiCheat } from './anti-cheat/anti-cheat';
import { CheatFlag, CheatReason } from './anti-cheat/cheat-report';
import { ParticipantKeyStore } from './block-chain/participant-key-store';
import { ParticipantKeys, ParticipantRegistry } from './block-chain/participant-registry';
import { SequencedBlockChain } from './block-chain/sequenced-block-chain';
import { BlockChainName } from './block-chain-name.enum';
import { BlockRoomInterface } from './block-room.interface';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { Player } from '../../player/player';
import { RoomNetwork } from '../../room-network/room-network';

/**
 * Names the block chain of each message type.
 * Each chain orders its blocks independently, so a busy chain never delays the messages of another one.
 */
export type BlockChainRouting<M extends object> = { readonly [K in keyof M & string]: BlockChainName };

/** A routing with at least one message type, an empty one is rejected at compile time */
export type NonEmptyBlockChainRouting<M extends object> = [keyof M & string] extends [never] ? never : BlockChainRouting<M>;

/** Merges the routings of several features, a message type routed twice is a mistake */
export function mergeBlockChainRoutings<A extends object, B extends object>(a: BlockChainRouting<A>, b: BlockChainRouting<B>): BlockChainRouting<A & B> {
    const duplicates: ReadonlyArray<string> = Object.keys(a).filter((type: string) => Object.hasOwn(b, type));

    if (duplicates.length > 0) {
        throw new Error(`Message types routed twice: ${ duplicates.join(', ') }`);
    }

    return { ...a, ...b };
}

/**
 * A room whose messages go through block chains, ordered by a sequencer: the host, then the participant taking over when
 * it leaves or when most of the other participants report it as cheating.
 * The participants check the blocks they receive and report the cheats to each other, outside the chains.
 */
export class BlockRoom<M extends object> extends Room<M> implements BlockRoomInterface {
    /** The chains are compared, and the entries not ordered reported, at this pace */
    private static readonly TICK_MS: number = 2000;

    private readonly participants: ParticipantRegistry;
    private readonly antiCheat: AntiCheat;
    /** The blocks and entries reported as cheated, by the local participant or the others */
    public readonly cheatFlags: Signal<ReadonlyArray<Readonly<CheatFlag>>>;
    /** The block chain of each message type, to transmit the messages */
    private readonly blockChainOf: ReadonlyMap<string, SequencedBlockChain>;
    /** The block chains by name, to dispatch the received messages */
    private readonly blockChains: ReadonlyMap<BlockChainName, SequencedBlockChain>;
    /** The block of each message delivered to the application, to report it */
    private readonly deliveredBlocks = new WeakMap<AppMessage, { chain: BlockChainName; block: Block }>();
    private sequencer: string;
    /** The sequencers most of the other participants reported as cheating */
    private distrusted = new Set<string>();
    /** The number of handovers made, to know whether the other participants follow a later sequencer */
    private handovers: number = 0;
    /** The sequencer each other participant follows, as it told this participant once its key was received */
    private readonly sequencerStates = new Map<string, Readonly<SequencerState>>();
    /** The participants each other participant is connected to, as it told this participant last */
    private readonly connectedViews = new Map<string, ReadonlySet<string>>();
    /** The participants this participant lost its connection to, until all the other participants lost them too */
    private readonly lost = new Set<string>();

    /** The stored keys of the player, so that it keeps its identity when reloading the page */
    public static async createKeys(playerName: string, keyStore: ParticipantKeyStore = new ParticipantKeyStore()): Promise<ParticipantKeys> {
        return await ParticipantRegistry.createKeys(await keyStore.keyPairOf(playerName));
    }

    /**
     * @param ticks$ the times the chains are compared at, until the room is cleared: every TICK_MS by default. Given by
     * the specs, to tick the room themselves without timer
     */
    public constructor(
        roomApi: RoomSocketApi,
        roomConnection: RoomNetwork,
        keys: ParticipantKeys,
        routing: NonEmptyBlockChainRouting<M>,
        ticks$: Observable<number> = interval(BlockRoom.TICK_MS).pipe(map(() => Date.now())),
    ) {
        super(roomApi, roomConnection);
        this.participants = new ParticipantRegistry(this.localPlayer, keys);
        this.antiCheat = new AntiCheat(this.participants);
        this.cheatFlags = this.antiCheat.flags;
        this.sequencer = this.hostName;

        const routes: BlockChainRouting<M> = routing;
        const routeMap: ReadonlyMap<string, BlockChainName> = new Map(Object.entries<BlockChainName>(routes));
        const blockChainByName = new Map<BlockChainName, SequencedBlockChain>();
        const blockChainOf = new Map<string, SequencedBlockChain>();
        for (const [type, name] of routeMap) {
            const blockChain: SequencedBlockChain = blockChainByName.get(name)
                ?? new SequencedBlockChain(name, routeMap, this, this.participants, this.antiCheat, this.sequencer);
            blockChainByName.set(name, blockChain);
            blockChainOf.set(type, blockChain);
        }
        this.blockChainOf = blockChainOf;
        this.blockChains = blockChainByName;

        this.participants.ready$.pipe(takeUntil(this.destroyRef)).subscribe((name: string) => {
            this.blockChains.forEach((blockChain: SequencedBlockChain) => blockChain.onParticipantReady(name));
            this.sendSequencerState(name);
            this.broadcastConnectedParticipants();
        });
        this.participants.left$.pipe(takeUntil(this.destroyRef)).subscribe((name: string) => this.onParticipantLeft(name));
        this.antiCheat.reported$.pipe(takeUntil(this.destroyRef)).subscribe(() => this.checkSequencerTrust());
        ticks$.pipe(takeUntil(this.destroyRef)).subscribe((now: number) => this.tick(now));
    }

    private tick(now: number): void {
        this.blockChains.forEach((blockChain: SequencedBlockChain) => blockChain.tick(now));
    }

    /** This participant lost its connection to another one: it may only be their link, the others still connected to it */
    private onParticipantLeft(name: string): void {
        this.blockChains.forEach((blockChain: SequencedBlockChain) => blockChain.onParticipantLeft(name));
        this.sequencerStates.delete(name);
        this.connectedViews.delete(name);
        this.lost.add(name);
        this.broadcastConnectedParticipants();
        this.checkDepartures();
    }

    private broadcastConnectedParticipants(): void {
        const participants: string[] = this.participantNames().filter((name: string) => name !== this.localPlayer.name).sort(BlockRoom.byCodeUnits);

        this.participants.broadcast({
            type: AntiCheatMessageType.CONNECTED_PARTICIPANTS,
            payload: { participants },
            origin: MessageOriginType.ANTI_CHEAT,
        });
    }

    private onConnectedParticipants(message: ReceivedAntiCheatMessage<AntiCheatMessageType.CONNECTED_PARTICIPANTS>): void {
        if (!Array.isArray(message.payload.participants)) {
            TimedLogger.error(`Invalid connected participants from ${ message.from }`, message.payload);
            return;
        }

        this.connectedViews.set(message.from, new Set(message.payload.participants));
        this.checkDepartures();
    }

    /**
     * A participant lost by this one has left the room once each other connected participant told it lost it too: the
     * participants who did not tell yet are waited for
     */
    private checkDepartures(): void {
        const others: ReadonlyArray<string> = this.participantNames().filter((name: string) => name !== this.localPlayer.name);

        for (const name of this.lost) {
            if (others.every((other: string) => this.connectedViews.get(other)?.has(name) === false)) {
                this.lost.delete(name);
                this.onDeparted(name);
            }
        }
    }

    /**
     * Every participant notices it, from the same participants: they all take the same decisions. The sequencer takes
     * the room over from a host which left
     */
    private onDeparted(name: string): void {
        TimedLogger.warn(`${ name } has left the room`);

        if (name === this.sequencer) {
            this.handOver();
        }

        if (name === this.hostName) {
            this.roomConnection.changeHost(this.sequencer);
        }
    }

    /** Most of the other participants reporting the sequencer as cheating take the ordering away from it */
    private checkSequencerTrust(): void {
        const accusers: ReadonlySet<string> = this.antiCheat.accusersOf(this.sequencer);
        const others: ReadonlyArray<string> = this.participantNames().filter((name: string) => name !== this.sequencer);

        if (others.filter((name: string) => accusers.has(name)).length * 2 > others.length) {
            TimedLogger.warn(`${ this.sequencer } is reported as cheating by most of the participants, it does not order the blocks anymore`);
            this.distrusted.add(this.sequencer);
            this.handOver();
        }
    }

    /**
     * Orders the names by their UTF-16 code units, the same in every browser: an order depending on the locale
     * (localeCompare) could make the participants name different successors
     */
    private static byCodeUnits(a: string, b: string): number {
        return Number(a > b) - Number(a < b);
    }

    /** Every participant names the same successor from the same participants: the first one by name, not distrusted */
    private handOver(): void {
        const successor: string | undefined = this.participantNames().filter((name: string) => !this.distrusted.has(name)).sort(BlockRoom.byCodeUnits)[0];

        if (successor === undefined) {
            TimedLogger.warn('No participant left to order the blocks');
            return;
        }

        this.handovers++;
        this.follow(successor);
    }

    private follow(sequencer: string): void {
        this.sequencer = sequencer;
        this.blockChains.forEach((blockChain: SequencedBlockChain) => blockChain.changeSequencer(sequencer));
    }

    private sendSequencerState(name: string): void {
        this.participants.send(name, {
            type: AntiCheatMessageType.SEQUENCER_STATE,
            payload: { sequencer: this.sequencer, handovers: this.handovers, distrusted: [...this.distrusted].sort(BlockRoom.byCodeUnits) },
            origin: MessageOriginType.ANTI_CHEAT,
        });
    }

    private onSequencerState(message: ReceivedAntiCheatMessage<AntiCheatMessageType.SEQUENCER_STATE>): void {
        this.sequencerStates.set(message.from, message.payload);
        this.followSequencerOfTheRoom();
    }

    /**
     * A player joining or reloading the page starts with the host as sequencer, it missed the handovers: it follows the
     * sequencer most of the other participants follow, after more handovers than it made.
     * A participant can not make the others follow a sequencer on its own.
     */
    private followSequencerOfTheRoom(): void {
        const others: ReadonlyArray<string> = this.participantNames().filter((name: string) => name !== this.localPlayer.name);
        const votes = new Map<string, { state: Readonly<SequencerState>; count: number }>();

        for (const name of others) {
            const state: Readonly<SequencerState> | undefined = this.sequencerStates.get(name);

            if (state && state.handovers > this.handovers) {
                const key: string = JSON.stringify([state.sequencer, state.handovers, state.distrusted]);
                votes.set(key, { state, count: (votes.get(key)?.count ?? 0) + 1 });
            }
        }

        const elected: Readonly<SequencerState> | undefined = [...votes.values()].find(({ count }) => count * 2 > others.length)?.state;

        if (elected) {
            TimedLogger.warn(`Most of the participants follow ${ elected.sequencer }, after ${ elected.handovers } handovers`);
            this.handovers = elected.handovers;
            this.distrusted = new Set(elected.distrusted);
            this.follow(elected.sequencer);
        }
    }

    private participantNames(): string[] {
        return [...this.participants.values()].map((participant) => participant.name);
    }

    public override clear(): void {
        super.clear();
        this.participants.clear();
        this.antiCheat.clear();
        this.blockChains.forEach((blockChain: SequencedBlockChain) => blockChain.clear());
    }

    public override transmitMessage<K extends keyof M & string>(type: K, payload: M[K]): void {
        const blockChain: SequencedBlockChain | undefined = this.blockChainOf.get(type);

        if (!blockChain) {
            throw new Error(`No block chain routes the ${ type } messages`);
        }

        // Do not await, there is no need to handle the result
        void blockChain.transmitMessage(type, payload);
    }

    /** Reports a message delivered by this room, the application finds cheated */
    public override reportCheat(message: AppMessage, reason: CheatReason): void {
        const delivered = this.deliveredBlocks.get(message);

        if (!delivered) {
            return;
        }

        const { chain, block } = delivered;
        this.antiCheat.report({ chain, subject: block.hash, index: block.index, author: message.from, sequencer: block.sequencer, reason });
    }

    protected override onMessage(message: ReceivedMessage): void {
        if (message.origin === MessageOriginType.BLOCK_ROOM_PARTICIPANT) {
            this.participants.handle(message);
        } else if (message.origin === MessageOriginType.ANTI_CHEAT) {
            this.onAntiCheatMessage(message);
        } else if (message.origin === MessageOriginType.BLOCK_ROOM_SERVICE) {
            const blockChain: SequencedBlockChain | undefined = this.blockChains.get(message.chain);

            if (blockChain) {
                blockChain.handle(message);
            } else {
                TimedLogger.error(`No ${ message.chain } block chain in this room, message from ${ message.from }`);
            }
        }
    }

    private onAntiCheatMessage(message: ReceivedAntiCheatMessage): void {
        if (message.type === AntiCheatMessageType.SEQUENCER_STATE) {
            this.onSequencerState(message);
        } else if (message.type === AntiCheatMessageType.CONNECTED_PARTICIPANTS) {
            this.onConnectedParticipants(message);
        } else {
            this.antiCheat.handle(message);
        }
    }

    public notifyMessage(chain: BlockChainName, block: Block): void {
        const message: AppMessage = block.entry.data;
        TimedLogger.log(message);

        this.deliveredBlocks.set(message, { chain, block });
        this.publicMessenger$.next(message);
    }

    protected override handleRoomPlayerAdd(player: Player): void {
        super.handleRoomPlayerAdd(player);
        // Back before the others lost it: it did not leave the room
        this.lost.delete(player.name);

        this.participants.onNewPlayer(player);
    }

    protected override handleRoomPlayerRemove(player: Player): void {
        super.handleRoomPlayerRemove(player);

        this.participants.onPlayerLeft(player);
    }
}
