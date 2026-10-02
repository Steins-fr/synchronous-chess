import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Room } from '@app/services/room-manager/classes/room/room';
import { takeUntil } from 'rxjs';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Signal } from '@angular/core';
import { AntiCheat } from './anti-cheat/anti-cheat';
import { CheatFlag } from './anti-cheat/cheat-report';
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
 * A room whose messages go through block chains, ordered by a sequencer: the host, then the participant taking over when it leaves.
 * The participants check the blocks they receive and report the cheats to each other, outside the chains.
 */
export class BlockRoom<M extends object> extends Room<M> implements BlockRoomInterface {

    private readonly participants: ParticipantRegistry;
    private readonly antiCheat: AntiCheat;
    /** The blocks reported as cheated, by the local participant or the others */
    public readonly cheatFlags: Signal<ReadonlyArray<Readonly<CheatFlag>>>;
    /** The block chain of each message type, to transmit the messages */
    private readonly blockChainOf: ReadonlyMap<string, SequencedBlockChain>;
    /** The block chains by name, to dispatch the received messages */
    private readonly blockChains: ReadonlyMap<BlockChainName, SequencedBlockChain>;
    private sequencer: string;

    /** The stored keys of the player, so that it keeps its identity when reloading the page */
    public static async createKeys(playerName: string, keyStore: ParticipantKeyStore = new ParticipantKeyStore()): Promise<ParticipantKeys> {
        return await ParticipantRegistry.createKeys(await keyStore.keyPairOf(playerName));
    }

    public constructor(
        roomApi: RoomSocketApi,
        roomConnection: RoomNetwork,
        keys: ParticipantKeys,
        routing: NonEmptyBlockChainRouting<M>,
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
        });
        this.participants.left$.pipe(takeUntil(this.destroyRef)).subscribe((name: string) => this.onParticipantLeft(name));
    }

    private onParticipantLeft(name: string): void {
        this.blockChains.forEach((blockChain: SequencedBlockChain) => blockChain.onParticipantLeft(name));

        if (name !== this.sequencer) {
            return;
        }

        // Every participant names the same successor from the same participants: the first one by name
        this.sequencer = [...this.participants.values()].map((participant) => participant.name).sort()[0];
        this.blockChains.forEach((blockChain: SequencedBlockChain) => blockChain.changeSequencer(this.sequencer));
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

    protected override onMessage(message: ReceivedMessage): void {
        if (message.origin === MessageOriginType.BLOCK_ROOM_PARTICIPANT) {
            this.participants.handle(message);
        } else if (message.origin === MessageOriginType.ANTI_CHEAT) {
            this.antiCheat.handle(message);
        } else if (message.origin === MessageOriginType.BLOCK_ROOM_SERVICE) {
            const blockChain: SequencedBlockChain | undefined = this.blockChains.get(message.chain);

            if (blockChain) {
                blockChain.handle(message);
            } else {
                TimedLogger.error(`No ${ message.chain } block chain in this room, message from ${ message.from }`);
            }
        }
    }

    public notifyMessage(data: AppMessage): void {
        TimedLogger.log(data);

        this.publicMessenger$.next(data);
    }

    protected override handleRoomPlayerAdd(player: Player): void {
        super.handleRoomPlayerAdd(player);

        this.participants.onNewPlayer(player);
    }

    protected override handleRoomPlayerRemove(player: Player): void {
        super.handleRoomPlayerRemove(player);

        this.participants.onPlayerLeft(player);
    }
}
